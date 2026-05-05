import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelKind, InvoiceType, Prisma, TaxMode } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';

export interface ChannelDto {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  isActive: boolean;
  isSystem: boolean;
  kind: ChannelKind;
  sortOrder: number;
  commissionPct: number;
  withInvoiceDefault: boolean;
  taxMode: TaxMode;
  unifiedRegimePct: number | null;
  iibbPct: number | null;
  appliesIva: boolean;
  defaultInvoiceType: InvoiceType;
  retentionIvaPct: number | null;
  retentionIibbPct: number | null;
  retentionIncomePct: number | null;
  notes: string | null;
}

export interface ChannelInput {
  name: string;
  slug: string;
  icon?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  kind: ChannelKind;
  commissionPct: number;
  withInvoiceDefault?: boolean;
  taxMode: TaxMode;
  unifiedRegimePct?: number | null;
  iibbPct?: number | null;
  appliesIva?: boolean;
  defaultInvoiceType?: InvoiceType;
  retentionIvaPct?: number | null;
  retentionIibbPct?: number | null;
  retentionIncomePct?: number | null;
  notes?: string | null;
}

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ChannelDto[]> {
    const channels = await this.prisma.channel.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return channels.map((c) => this.toDto(c));
  }

  /**
   * Counts that quantify the blast radius of disabling a channel: how many
   * products have it enabled (their pricing block disappears) and how many
   * quotes already reference it (they won't break, but the channel won't
   * be selectable for new ones).
   */
  async impact(id: string): Promise<{
    productsEnabled: number;
    quotesUsing: number;
    sampleProductNames: string[];
  }> {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('Canal inexistente');

    const [productsEnabled, quotesUsing, sample] = await Promise.all([
      this.prisma.productChannel.count({ where: { channelId: id, isEnabled: true } }),
      this.prisma.quote.count({ where: { channelId: id } }),
      this.prisma.productChannel.findMany({
        where: { channelId: id, isEnabled: true },
        include: { product: { select: { name: true } } },
        take: 5,
        orderBy: { product: { name: 'asc' } },
      }),
    ]);
    return {
      productsEnabled,
      quotesUsing,
      sampleProductNames: sample.map((s) => s.product.name),
    };
  }

  async create(input: ChannelInput): Promise<ChannelDto> {
    const slugTaken = await this.prisma.channel.findUnique({ where: { slug: input.slug } });
    if (slugTaken) throw new ConflictException('Slug ya registrado');
    const created = await this.prisma.channel.create({
      data: this.toPrismaCreate(input),
    });
    return this.toDto(created);
  }

  async update(id: string, input: Partial<ChannelInput>): Promise<ChannelDto> {
    const existing = await this.prisma.channel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Canal inexistente');
    if (input.slug && input.slug !== existing.slug) {
      const conflict = await this.prisma.channel.findUnique({ where: { slug: input.slug } });
      if (conflict) throw new ConflictException('Slug ya registrado');
    }
    if (existing.isSystem && input.kind && input.kind !== existing.kind) {
      throw new BadRequestException('No se puede cambiar el tipo de un canal del sistema');
    }
    if (existing.isSystem && input.slug && input.slug !== existing.slug) {
      throw new BadRequestException('No se puede cambiar el slug de un canal del sistema');
    }
    const updated = await this.prisma.channel.update({
      where: { id },
      data: input as Prisma.ChannelUpdateInput,
    });
    return this.toDto(updated);
  }

  async remove(id: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('Canal inexistente');
    if (channel.isSystem) {
      throw new BadRequestException(
        'Los canales del sistema no se pueden eliminar. Desactivalos si querés ocultarlos.',
      );
    }
    const used = await this.prisma.quote.count({ where: { channelId: id } });
    if (used > 0) {
      await this.prisma.channel.update({ where: { id }, data: { isActive: false } });
      return;
    }
    await this.prisma.channel.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Canal inexistente');
    });
  }

  private toPrismaCreate(input: ChannelInput): Prisma.ChannelCreateInput {
    return {
      name: input.name,
      slug: input.slug,
      icon: input.icon ?? null,
      isActive: input.isActive ?? true,
      isSystem: false, // user-created channels are never system
      kind: input.kind,
      sortOrder: input.sortOrder ?? 0,
      commissionPct: input.commissionPct,
      withInvoiceDefault: input.withInvoiceDefault ?? false,
      taxMode: input.taxMode,
      unifiedRegimePct: input.unifiedRegimePct ?? null,
      iibbPct: input.iibbPct ?? null,
      appliesIva: input.appliesIva ?? false,
      defaultInvoiceType: input.defaultInvoiceType ?? InvoiceType.X,
      retentionIvaPct: input.retentionIvaPct ?? null,
      retentionIibbPct: input.retentionIibbPct ?? null,
      retentionIncomePct: input.retentionIncomePct ?? null,
      notes: input.notes ?? null,
    };
  }

  private toDto(c: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    isActive: boolean;
    isSystem: boolean;
    kind: ChannelKind;
    sortOrder: number;
    commissionPct: Prisma.Decimal;
    withInvoiceDefault: boolean;
    taxMode: TaxMode;
    unifiedRegimePct: Prisma.Decimal | null;
    iibbPct: Prisma.Decimal | null;
    appliesIva: boolean;
    defaultInvoiceType: InvoiceType;
    retentionIvaPct: Prisma.Decimal | null;
    retentionIibbPct: Prisma.Decimal | null;
    retentionIncomePct: Prisma.Decimal | null;
    notes: string | null;
  }): ChannelDto {
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      isActive: c.isActive,
      isSystem: c.isSystem,
      kind: c.kind,
      sortOrder: c.sortOrder,
      commissionPct: dec(c.commissionPct),
      withInvoiceDefault: c.withInvoiceDefault,
      taxMode: c.taxMode,
      unifiedRegimePct: decOrNull(c.unifiedRegimePct),
      iibbPct: decOrNull(c.iibbPct),
      appliesIva: c.appliesIva,
      defaultInvoiceType: c.defaultInvoiceType,
      retentionIvaPct: decOrNull(c.retentionIvaPct),
      retentionIibbPct: decOrNull(c.retentionIibbPct),
      retentionIncomePct: decOrNull(c.retentionIncomePct),
      notes: c.notes,
    };
  }
}
