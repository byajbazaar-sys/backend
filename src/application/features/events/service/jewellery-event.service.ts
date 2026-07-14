import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { Paged } from '@shared-libs';
import { EJewelleryEventStatus, JewelleryEvent } from '../domain';
import { JEWELLERY_EVENT_SYNC_STATES } from '../constants';
import { buildEventSlug, eventDedupeKey } from '../utils/slug.util';
import {
  CreateJewelleryEventRequestModel,
  ListJewelleryEventsQueryModel,
  UpdateJewelleryEventRequestModel,
} from '../models';
import {
  DiscoveredEvent,
  EVENTS_DISCOVERY_SERVICE,
  IEventsDiscoveryService,
} from '../../../shared';
import {
  IJewelleryEventsRepository,
  JEWELLERY_EVENTS_REPOSITORY,
} from './i-jewellery-events.repository';
import { IJewelleryEventService } from './i-jewellery-event.service';

@Injectable()
export class JewelleryEventService implements IJewelleryEventService {
  constructor(
    @Inject(JEWELLERY_EVENTS_REPOSITORY)
    private readonly eventsRepo: IJewelleryEventsRepository,
    @Inject(EVENTS_DISCOVERY_SERVICE) private readonly eventsDiscovery: IEventsDiscoveryService,
    @InjectPinoLogger(JewelleryEventService.name) private readonly logger: PinoLogger,
  ) {}

  private toDate(value?: string | Date | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private normalizeTags(tags?: string[] | null): string[] {
    if (!Array.isArray(tags)) return [];
    return tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6);
  }

  private assertValidDates(startDate?: Date | null, endDate?: Date | null): void {
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate cannot be earlier than startDate');
    }
  }

  private async resolveUniqueSlug(
    desired: string,
    excludeId?: string,
  ): Promise<string> {
    let slug = desired || `event-${Date.now()}`;
    let attempt = 0;
    while (attempt < 50) {
      const existing = await this.eventsRepo.findBySlug(slug);
      if (!existing || (excludeId && existing.id === excludeId)) {
        return slug;
      }
      attempt += 1;
      slug = `${desired}-${attempt + 1}`;
    }
    return `${desired}-${Date.now()}`;
  }

  private fromRequest(
    body: CreateJewelleryEventRequestModel | UpdateJewelleryEventRequestModel,
  ): Partial<JewelleryEvent> {
    return {
      name: body.name?.trim(),
      slug: body.slug?.trim(),
      description: body.description?.trim() || null,
      startDate: this.toDate(body.startDate),
      endDate: this.toDate(body.endDate),
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      country: body.country?.trim() || 'India',
      venue: body.venue?.trim() || null,
      organizer: body.organizer?.trim() || null,
      category: body.category?.trim() || null,
      website: body.website?.trim() || null,
      registrationUrl: body.registrationUrl?.trim() || null,
      sourceUrl: body.sourceUrl?.trim() || null,
      visitorEntryFee: body.visitorEntryFee?.trim() || null,
      stallFee: body.stallFee?.trim() || null,
      contactEmail: body.contactEmail?.trim() || null,
      contactPhone: body.contactPhone?.trim() || null,
      tags: this.normalizeTags(body.tags),
      status: body.status ?? EJewelleryEventStatus.ACTIVE,
      isFeatured: body.isFeatured ?? false,
      seoTitle: body.seoTitle?.trim() || null,
      seoDescription: body.seoDescription?.trim() || null,
    };
  }

  private fromGemini(event: DiscoveredEvent): JewelleryEvent {
    const startDate = this.toDate(event.startDate);
    const slug =
      (event.slug && event.slug.trim()) ||
      buildEventSlug({ name: event.name, city: event.city, startDate });
    return plainToInstance(
      JewelleryEvent,
      {
        name: (event.name ?? '').trim(),
        slug,
        description: event.description?.trim() || null,
        startDate,
        endDate: this.toDate(event.endDate),
        city: event.city?.trim() || null,
        state: event.state?.trim() || null,
        country: 'India',
        venue: event.venue?.trim() || null,
        organizer: event.organizer?.trim() || null,
        category: event.category?.trim() || null,
        website: event.website?.trim() || null,
        registrationUrl: event.registrationUrl?.trim() || null,
        sourceUrl: event.sourceUrl?.trim() || null,
        visitorEntryFee: event.visitorEntryFee?.trim() || null,
        stallFee: event.stallFee?.trim() || null,
        contactEmail: event.contactEmail?.trim() || null,
        contactPhone: event.contactPhone?.trim() || null,
        tags: this.normalizeTags(event.tags),
        status: EJewelleryEventStatus.ACTIVE,
        isFeatured: false,
        seoTitle: null,
        seoDescription: null,
      },
      { excludeExtraneousValues: true },
    );
  }

  async listPublic(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>> {
    return this.eventsRepo.list({
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      city: query.city,
      state: query.state,
      search: query.search,
      featured: query.featured === 'true' || query.featured === '1',
      status: EJewelleryEventStatus.ACTIVE,
      upcomingOnly: true,
    });
  }

  async getBySlug(slug: string): Promise<{ event: JewelleryEvent; related: JewelleryEvent[] }> {
    const event = await this.eventsRepo.findBySlug(slug);
    if (!event || event.status !== EJewelleryEventStatus.ACTIVE) {
      throw new NotFoundException('Event not found');
    }
    const related = await this.eventsRepo.findRelated({
      excludeId: event.id!,
      city: event.city,
      state: event.state,
      limit: 6,
    });
    return { event, related };
  }

  async listAdmin(query: ListJewelleryEventsQueryModel): Promise<Paged<JewelleryEvent>> {
    return this.eventsRepo.list({
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      city: query.city,
      state: query.state,
      search: query.search,
      status: query.status,
      featured: query.featured === 'true' || query.featured === '1' ? true : undefined,
      upcomingOnly: false,
    });
  }

  async create(body: CreateJewelleryEventRequestModel): Promise<JewelleryEvent> {
    const data = this.fromRequest(body);
    if (!data.name) {
      throw new BadRequestException('name is required');
    }
    this.assertValidDates(data.startDate ?? null, data.endDate ?? null);

    const duplicate = await this.eventsRepo.findDuplicate({
      name: data.name,
      city: data.city,
      startDate: data.startDate,
    });
    if (duplicate) {
      throw new ConflictException('An event with the same name, city and start date already exists');
    }

    const baseSlug =
      data.slug ||
      buildEventSlug({ name: data.name, city: data.city, startDate: data.startDate });
    data.slug = await this.resolveUniqueSlug(baseSlug);

    return this.eventsRepo.create({
      ...(data as JewelleryEvent),
      status: data.status ?? EJewelleryEventStatus.ACTIVE,
      isFeatured: data.isFeatured ?? false,
      tags: data.tags ?? [],
      country: data.country ?? 'India',
    });
  }

  async update(id: string, body: UpdateJewelleryEventRequestModel): Promise<JewelleryEvent> {
    const existing = await this.eventsRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    const data = this.fromRequest(body);
    const name = data.name ?? existing.name;
    const city = data.city !== undefined ? data.city : existing.city;
    const startDate = data.startDate !== undefined ? data.startDate : existing.startDate;
    const endDate = data.endDate !== undefined ? data.endDate : existing.endDate;
    this.assertValidDates(startDate ?? null, endDate ?? null);

    const duplicate = await this.eventsRepo.findDuplicate({ name, city, startDate });
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('An event with the same name, city and start date already exists');
    }

    if (data.slug || data.name || data.city !== undefined || data.startDate !== undefined) {
      const baseSlug =
        data.slug ||
        buildEventSlug({ name, city, startDate });
      data.slug = await this.resolveUniqueSlug(baseSlug, id);
    }

    return this.eventsRepo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.eventsRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Event not found');
    }
    await this.eventsRepo.delete(id);
  }

  async fetchStateEvents(state: string): Promise<DiscoveredEvent[]> {
    this.logger.info({ state }, 'Fetching jewellery events for state');
    const basic = await this.eventsDiscovery.fetchBasicEventsForState(state);

    const needsEnrichment: DiscoveredEvent[] = [];
    const known: DiscoveredEvent[] = [];

    for (const event of basic) {
      const slug =
        event.slug ||
        buildEventSlug({ name: event.name, city: event.city, startDate: event.startDate });
      const existing = await this.eventsRepo.findBySlug(slug);
      const missingDetails =
        !event.description ||
        !event.visitorEntryFee ||
        !event.contactEmail ||
        !event.contactPhone;
      if (!existing || missingDetails) {
        needsEnrichment.push(event);
      } else {
        known.push(event);
      }
    }

    const enriched = needsEnrichment.length
      ? await this.eventsDiscovery.enrichEvents(needsEnrichment)
      : [];

    return [...known, ...enriched];
  }

  async mergeAndUpsert(events: DiscoveredEvent[]): Promise<{ upserted: number }> {
    const map = new Map<string, DiscoveredEvent>();
    for (const event of events) {
      if (!event?.name?.trim()) continue;
      map.set(eventDedupeKey(event), event);
    }

    let upserted = 0;
    for (const event of map.values()) {
      const entity = this.fromGemini(event);
      if (!entity.name) continue;

      const existing = await this.eventsRepo.findDuplicate({
        name: entity.name,
        city: entity.city,
        startDate: entity.startDate,
      });
      if (existing?.slug) {
        entity.slug = existing.slug;
      } else {
        entity.slug = await this.resolveUniqueSlug(entity.slug);
      }
      await this.eventsRepo.upsertBySlug(entity);
      upserted += 1;
    }

    this.logger.info({ upserted }, 'Merged jewellery events');
    return { upserted };
  }

  async syncStates(states?: string[]): Promise<{ states: string[]; upserted: number }> {
    const targetStates = (states?.length ? states : [...JEWELLERY_EVENT_SYNC_STATES]).map((s) =>
      s.trim(),
    );
    const all: DiscoveredEvent[] = [];
    for (const state of targetStates) {
      try {
        const events = await this.fetchStateEvents(state);
        all.push(...events);
      } catch (err) {
        this.logger.error({ err, state }, 'Failed to fetch events for state');
      }
    }
    const result = await this.mergeAndUpsert(all);
    return { states: targetStates, upserted: result.upserted };
  }

  async listActiveSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>> {
    return this.eventsRepo.listActiveSlugs();
  }
}
