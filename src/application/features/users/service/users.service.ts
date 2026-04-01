import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { User } from '../domain';
import { IUsersRepository, USERS_REPOSITORY } from './i-users.repository';
import { IUsersService } from './i-users.service';
import { Paged, toPaged, normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { USERS_FILE_STORAGE, IUsersFileStorage } from '../../../shared';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly usersFileStorage: IUsersFileStorage,
    @InjectPinoLogger(UsersService.name) private readonly logger: PinoLogger,
  ) { }

  async findOne(id: string): Promise<User> {
    try {
      const user = await this.usersRepo.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get the profile photo URL if it exists
      const profilePhotoUrl = user.profilePhotoRef
        ? await this.usersFileStorage.getUrlAsync(user.profilePhotoRef)
        : null;

      const response: User = {
        ...user,
        profilePhotoUrl,
      } as User;

      return response;
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
      // TODO: Implement proper filtering and pagination
      // For now, return empty result as the repository doesn't have listUsers method
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

  async update(id: string, updateData: User): Promise<User> {
    try {
      const existingUser = await this.usersRepo.findById(id);
      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      // Handle profile photo upload if provided
      if (updateData.profilePhoto && updateData.profilePhotoContentType) {
        this.logger.info({ userId: id }, 'Uploading profile photo to S3');

        // Delete old profile photo if it exists
        if (existingUser.profilePhotoRef) {
          try {
            await this.usersFileStorage.removeAsync(existingUser.profilePhotoRef);
            this.logger.debug({ userId: id, oldPhotoRef: existingUser.profilePhotoRef }, 'Old profile photo deleted');
          } catch (err) {
            this.logger.warn({ err, userId: id, oldPhotoRef: existingUser.profilePhotoRef }, 'Failed to delete old profile photo, continuing');
          }
        }

        // Upload new profile photo
        const normalized = await normalizeImageBufferForStorageOrThrow(
          updateData.profilePhoto,
          updateData.profilePhotoContentType,
          updateData.profilePhotoFileName,
        );
        const newProfilePhotoRef = `users/profiles/${id}.${normalized.fileExtension}`;
        await this.usersFileStorage.writeAsync(newProfilePhotoRef, normalized.buffer, normalized.mimetype);

        updateData.profilePhotoRef = newProfilePhotoRef;
        this.logger.info({ userId: id, profilePhotoRef: newProfilePhotoRef }, 'Profile photo uploaded successfully');
      }

      // Remove file-related fields from updateData before saving to database
      const { profilePhoto, profilePhotoContentType, profilePhotoFileName, ...dataToUpdate } = updateData;
      const updatedUser = await this.usersRepo.update(id, dataToUpdate as Partial<User> as User);
      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      // Get the profile photo URL if it exists
      const profilePhotoUrl = updatedUser.profilePhotoRef
        ? await this.usersFileStorage.getUrlAsync(updatedUser.profilePhotoRef)
        : null;

      this.logger.info({ profilePhotoUrl }, 'Profile photo URL');

      const response: User = {
        ...updatedUser,
        profilePhotoRef: profilePhotoUrl,
      } as User;

      this.logger.info({ userId: id }, 'User updated successfully');
      return response;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error({ err, userId: id }, 'Error updating user');
      throw err;
    }
  }
}
