import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { CreateRealEstateListingDto } from './dto/create-listing.dto';
import { UpdateRealEstateListingDto } from './dto/update-listing.dto';
import { RealEstateListingStatus } from '@prisma/client';

@Injectable()
export class RealEstateService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  /** Upload property image to Cloudinary */
  async uploadListingImage(imageDataUri: string) {
    return this.cloudinary.uploadImage(imageDataUri, 'soboggan/real-estate');
  }

  /** Public: all ACTIVE listings for the mobile app */
  async listActiveListings() {
    return this.prisma.realEstateListing.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin: all listings regardless of status */
  async listAllListings(status?: RealEstateListingStatus) {
    return this.prisma.realEstateListing.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { buyInstructions: true } },
      },
    });
  }

  /** Admin: create a new listing */
  async createListing(dto: CreateRealEstateListingDto) {
    return this.prisma.realEstateListing.create({
      data: {
        title: dto.title,
        location: dto.location,
        description: dto.description ?? null,
        pricePerUnit: dto.pricePerUnit,
        totalUnits: dto.totalUnits ?? 1,
        imageUrl: dto.imageUrl ?? null,
      },
    });
  }

  /** Admin: update listing fields / mark SOLD */
  async updateListing(id: string, dto: UpdateRealEstateListingDto) {
    const listing = await this.prisma.realEstateListing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Real estate listing not found');

    return this.prisma.realEstateListing.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.pricePerUnit !== undefined && { pricePerUnit: dto.pricePerUnit }),
        ...(dto.totalUnits !== undefined && { totalUnits: dto.totalUnits }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async getListingById(id: string) {
    const listing = await this.prisma.realEstateListing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }
}
