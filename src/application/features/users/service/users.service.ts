import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EUserType } from '@shared-libs';
import { User } from '../domain';
import { IUsersRepository, USERS_REPOSITORY } from './i-users.repository';
import { IUsersService } from './i-users.service';
import { Paged, toPaged, normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { USERS_FILE_STORAGE, IUsersFileStorage } from '../../../shared';

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly usersFileStorage: IUsersFileStorage,
    @InjectPinoLogger(UsersService.name) private readonly logger: PinoLogger,
  ) {}

  private async resolvePhotoUrl(ref?: string | null): Promise<string | null> {
    if (!ref) return null;
    return this.usersFileStorage.getUrlAsync(ref);
  }

  private async withAssetUrls(user: User): Promise<User> {
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
    } as User;
  }

  async findOne(id: string): Promise<User> {
    try {
      const user = await this.usersRepo.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return this.withAssetUrls(user);
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
    existingRef: string | undefined,
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

      const definedUpdates = Object.fromEntries(
        Object.entries(dataToUpdate).filter(([, value]) => value !== undefined),
      ) as Partial<User>;

      const updatedUser = await this.usersRepo.update(id, definedUpdates as Partial<User> as User);
      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      this.logger.info({ userId: id }, 'User updated successfully');
      return this.withAssetUrls(updatedUser);
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
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
    this.logger.info({ userId: id }, 'User soft-deleted');
  }
}
