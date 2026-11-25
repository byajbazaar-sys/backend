import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EUserType, Paged, toPaged, normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { User } from '../domain';
import { UserUpdatePatch } from '../models';
import { IUsersRepository, USERS_REPOSITORY } from './i-users.repository';
import { IUsersService } from './i-users.service';
import {
  CACHE_NAMESPACE,
  CACHE_SERVICE,
  ICacheService,
  IUsersFileStorage,
  USERS_FILE_STORAGE,
  USER_DETAILS_CACHE_TTL_SECONDS,
  normalizeIndianMobile,
} from '../../../shared';
import {
  IShopMembershipsRepository,
  SHOP_MEMBERSHIPS_REPOSITORY,
} from '../../shops/service/i-shop-memberships.repository';
import { isCatalogSlugUniqueViolation, resolveCatalogSlugForBusinessName } from '../utils';

type CachedUser = User & { profilePhotoUrl?: string; shopLogoUrl?: string };

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly usersFileStorage: IUsersFileStorage,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @Inject(SHOP_MEMBERSHIPS_REPOSITORY) private readonly memberships: IShopMembershipsRepository,
    @InjectPinoLogger(UsersService.name) private readonly logger: PinoLogger,
  ) {}

  private async resolvePhotoUrl(ref?: string): Promise<string> {
    if (!ref) return null;
    return this.usersFileStorage.getUrlAsync(ref);
  }

  private async withAssetUrls(user: User): Promise<CachedUser> {
    const [profilePhotoUrl, shopLogoUrl] = await Promise.all([
      this.resolvePhotoUrl(user.profilePhotoRef),
      this.resolvePhotoUrl(user.shopLogoRef),
    ]);
    return {
      ...user,
      profilePhotoUrl,
      shopLogoUrl,
      profilePhotoRef: profilePhotoUrl ?? user.profilePhotoRef,
      shopLogoRef: shopLogoUrl ?? user.shopLogoRef,
    };
  }

  private toCachedUser(user: CachedUser): CachedUser {
    const {
      password: _password,
      resetPasswordToken: _resetPasswordToken,
      resetPasswordExpires: _resetPasswordExpires,
      profilePhoto: _profilePhoto,
      profilePhotoContentType: _profilePhotoContentType,
      profilePhotoFileName: _profilePhotoFileName,
      shopLogo: _shopLogo,
      shopLogoContentType: _shopLogoContentType,
      shopLogoFileName: _shopLogoFileName,
      googleId: _googleId,
      ...safe
    } = user;
    return safe as CachedUser;
  }

  async findOne(id: string): Promise<User> {
    try {
      return await this.cache.getOrLoadVersioned(
        CACHE_NAMESPACE.USER_DETAILS,
        id,
        ['profile'],
        USER_DETAILS_CACHE_TTL_SECONDS,
        async () => {
          const user = await this.usersRepo.findById(id);
          if (!user) {
            throw new NotFoundException('User not found');
          }
          return this.toCachedUser(await this.withAssetUrls(user));
        },
      );
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, userId: id }, 'Error finding user');
      throw err;
    }
  }

  async findAll(query: any): Promise<Paged<User>> {
    try {
      this.logger.warn({ query }, 'findAll not fully implemented');
      return toPaged(User, {
        items: [],
        page: query.page || 1,
        perPage: query.limit || 10,
        totalCount: 0,
      });
    } catch (err) {
      this.logger.error({ err, query }, 'Error finding all users');
      throw err;
    }
  }

  private async uploadImage(
    userId: string,
    buffer: Buffer,
    contentType: string,
    fileName: string,
    existingRef: string,
    storagePath: string,
  ): Promise<string> {
    if (existingRef) {
      try {
        await this.usersFileStorage.removeAsync(existingRef);
      } catch (err) {
        this.logger.warn({ err, userId, existingRef }, 'Failed to delete old image, continuing');
      }
    }

    const normalized = await normalizeImageBufferForStorageOrThrow(buffer, contentType, fileName);
    return this.usersFileStorage.writeAsync(
      `${storagePath}.${normalized.fileExtension}`,
      normalized.buffer,
      normalized.mimetype,
    );
  }

  async update(id: string, updateData: User): Promise<User> {
    try {
      const existingUser = await this.usersRepo.findById(id);
      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      if (updateData.profilePhoto && updateData.profilePhotoContentType) {
        updateData.profilePhotoRef = await this.uploadImage(
          id,
          updateData.profilePhoto,
          updateData.profilePhotoContentType,
          updateData.profilePhotoFileName,
          existingUser.profilePhotoRef,
          `users/profiles/${id}`,
        );
      }

      if (updateData.shopLogo && updateData.shopLogoContentType) {
        updateData.shopLogoRef = await this.uploadImage(
          id,
          updateData.shopLogo,
          updateData.shopLogoContentType,
          updateData.shopLogoFileName,
          existingUser.shopLogoRef,
          `users/shop-logos/${id}`,
        );
      }

      const {
        profilePhoto,
        profilePhotoContentType,
        profilePhotoFileName,
        shopLogo,
        shopLogoContentType,
        shopLogoFileName,
        ...dataToUpdate
      } = updateData;

      const definedUpdates = instanceToPlain(
        plainToInstance(UserUpdatePatch, dataToUpdate, { excludeExtraneousValues: true }),
        { exposeUnsetFields: false },
      ) as UserUpdatePatch;

      // The mobile number is verified by SMS code and unique per account, so it can only be
      // changed through Account → Verify mobile (POST /users/me/verification).
      if (definedUpdates.phoneNumber !== undefined) {
        const current = normalizeIndianMobile(existingUser.phoneNumber) ?? (existingUser.phoneNumber ?? '').trim();
        const next = normalizeIndianMobile(definedUpdates.phoneNumber) ?? (definedUpdates.phoneNumber ?? '').trim();
        if (next === current) {
          delete definedUpdates.phoneNumber;
        } else {
          throw new BadRequestException(
            'To change your mobile number, verify the new number from Account → Mobile number.',
          );
        }
      }

      if (definedUpdates.businessName !== undefined) {
        const trimmed = definedUpdates.businessName?.trim() ?? '';
        if (!trimmed) {
          definedUpdates.businessName = null;
          definedUpdates.catalogSlug = null;
        } else {
          definedUpdates.businessName = trimmed;
          const previous = (existingUser.businessName ?? '').trim();
          if (trimmed !== previous) {
            definedUpdates.catalogSlug = await resolveCatalogSlugForBusinessName(this.usersRepo, trimmed, id);
          }
        }
      }

      let updatedUser: User;
      try {
        updatedUser = await this.usersRepo.update(id, definedUpdates);
      } catch (err) {
        if (isCatalogSlugUniqueViolation(err)) {
          throw new ConflictException(
            'This business name is already being used for a catalog URL. Please choose a unique business name.',
          );
        }
        throw err;
      }
      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      this.logger.info({ userId: id }, 'User updated successfully');
      await this.invalidateUserDetailsCache(id);
      return this.withAssetUrls(updatedUser);
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException || err instanceof ConflictException) {
        throw err;
      }
      this.logger.error({ err, userId: id }, 'Error updating user');
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.userType === EUserType.Admin) {
      throw new BadRequestException('Admin accounts cannot be deleted');
    }

    await this.usersRepo.softDelete(id);
    await this.invalidateUserDetailsCache(id);
    if (!user.ownerUserId) {
      // Extra shops the person added live on their account and plan: they go with it (members lose access too).
      for (const shop of await this.usersRepo.listByOwner(id)) {
        await this.usersRepo.softDelete(shop.id);
        await this.invalidateUserDetailsCache(shop.id);
      }
      // The person leaves every shop they were invited to (a soft delete doesn't fire the FK cascade).
      await this.memberships.deleteForMember(id);
    }
    this.logger.info({ userId: id }, 'User soft-deleted');
  }

  private async invalidateUserDetailsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.USER_DETAILS, userId);
  }
}
