import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Order, OrderItem, Product, Table, User, RestaurantConfig } from '../types/domain';
import { formatBRL } from '../utils/currency';

// Tipos locais para o PDF — usa domain.ts em vez de @prisma/client
type OrderWithDetails = Order & {
  items: (OrderItem & { product: Product | null })[];
  table?: Table | null;
  waiter?: User | null;
};

type ConfigForPdf = Pick<RestaurantConfig, 'name' | 'address' | 'phone'>;

export class PdfService {
  static async generateOrderReceipt(order: OrderWithDetails, config: ConfigForPdf): Promise<Buffer> {
    let estimatedHeight = 60 + (order.items.length * 15);
    order.items.forEach(item => {
      if (item.notes) {
        estimatedHeight += (item.notes.split('\n').length * 4);
      }
    });

    const doc = new jsPDF({
      unit: 'mm',
      format: [80, Math.max(240, estimatedHeight)],
    }) as any;

    const margin = 5;
    let y = 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(config.name, 40, y, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    y += 5;

    if (config.address) {
      doc.text(config.address, 40, y, { align: 'center', maxWidth: 70 });
      y += 5;
    }

    if (config.phone) {
      doc.text(`Tel: ${config.phone}`, 40, y, { align: 'center' });
      y += 5;
    }

    doc.line(margin, y, 75, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.text(`PEDIDO: #${order.id.slice(-6).toUpperCase()}`, margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${new Date(order.createdAt).toLocaleString('pt-BR')}`, margin, y);
    y += 4;

    if (order.customerName) {
      doc.text(`Cliente: ${order.customerName}`, margin, y);
      y += 4;
    }

    if (order.table) {
      doc.text(`Mesa: ${order.table.number}`, margin, y);
      y += 4;
    }

    if (order.waiter) {
      doc.text(`Garçom: ${order.waiter.name}`, margin, y);
      y += 4;
    }

    if (order.deliveryStreet) {
      doc.text(
        `Entrega: ${order.deliveryStreet}, ${order.deliveryNumber || ''}`,
        margin,
        y,
        { maxWidth: 68 }
      );
      y += 4;
    }

    doc.line(margin, y, 75, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('ITEM', margin, y);
    doc.text('QTD', 45, y);
    doc.text('TOTAL', 75, y, { align: 'right' });
    y += 4;
    doc.setFont('helvetica', 'normal');

    order.items.forEach((item) => {
      const name = item.product?.name ?? 'Produto';
      const qty = item.weight ? `${(item.weight / 1000).toFixed(3)}kg` : `${item.quantity}x`;
      const price = formatBRL(item.price);

      doc.text(name, margin, y, { maxWidth: 35 });
      doc.text(qty, 45, y);
      doc.text(price, 75, y, { align: 'right' });
      y += 5;

      if (item.notes) {
        const noteLines = doc.splitTextToSize(item.notes, 65);
        doc.setFontSize(7);
        doc.text(noteLines, margin + 2, y);
        y += noteLines.length * 3.5;
        doc.setFontSize(8);
      }

      y += 1;
    });

    if (order.deliveryFee && Number(order.deliveryFee) > 0) {
      doc.text('Taxa de entrega', margin, y);
      doc.text(formatBRL(order.deliveryFee), 75, y, { align: 'right' });
      y += 5;
      doc.line(margin, y, 75, y);
      y += 5;
    } else {
      doc.line(margin, y, 75, y);
      y += 5;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', margin, y);
    doc.text(formatBRL(order.total), 75, y, { align: 'right' });

    y += 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Obrigado pela preferência!', 40, y, { align: 'center' });

    return Buffer.from(doc.output('arraybuffer'));
  }
}
