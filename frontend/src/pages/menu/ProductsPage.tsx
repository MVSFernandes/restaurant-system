import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import type { Product, Category, StockItem, ProductStockLink } from '../../types';
import {
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  PageHeader,
  Select,
  SkeletonCard,
  Textarea,
  useToast,
} from '../../components/ui';
import { ProductIcon, StockLinkIcon, WarningIcon } from '../../components/ui/icons';

interface LinkFormRow {
  stockItemId: string;
  quantity: string;
}

const ProductsPage: React.FC = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    imageUrl: '',
    isByWeight: false,
  });

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingProduct, setLinkingProduct] = useState<Product | null>(null);
  const [linkRows, setLinkRows] = useState<LinkFormRow[]>([]);
  const [savingLinks, setSavingLinks] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [productsRes, categoriesRes, stockRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/stock'),
      ]);

      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setStockItems(stockRes.data);
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao carregar produtos', description: 'Não foi possível atualizar a listagem.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setForm({
        name: product.name,
        description: product.description || '',
        price: String(product.price),
        categoryId: product.categoryId,
        imageUrl: product.imageUrl || '',
        isByWeight: product.isByWeight || false,
      });
    } else {
      setEditingProduct(null);
      setForm({
        name: '',
        description: '',
        price: '',
        categoryId: categories[0]?.id || '',
        imageUrl: '',
        isByWeight: false,
      });
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price || !form.categoryId) return;

    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
      } else {
        await api.post('/products', payload);
      }

      toast({ title: editingProduct ? 'Produto atualizado' : 'Produto criado', variant: 'success' });
      setShowModal(false);
      void fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao salvar produto', description: 'Revise os dados e tente novamente.', variant: 'error' });
    }
  };

  const handleOpenDeleteModal = (product: Product) => {
    setProductToDelete(product);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;

    try {
      setDeleting(true);
      await api.delete(`/products/${productToDelete.id}`);
      toast({ title: 'Produto excluído', variant: 'success' });
      setDeleteModalOpen(false);
      setProductToDelete(null);
      void fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao excluir produto', description: 'Tente novamente.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setProductToDelete(null);
  };

  const handleOpenLinkModal = async (product: Product) => {
    try {
      setLinkingProduct(product);

      const { data } = await api.get<ProductStockLink[]>(
        `/product-stock-links/product/${product.id}`
      );

      if (data.length > 0) {
        setLinkRows(
          data.map((link) => ({
            stockItemId: link.stockItemId,
            quantity: String(link.quantity),
          }))
        );
      } else {
        setLinkRows([{ stockItemId: '', quantity: '1' }]);
      }

      setShowLinkModal(true);
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao carregar vínculos', description: 'Você ainda pode definir novos vínculos.', variant: 'error' });
      setLinkingProduct(product);
      setLinkRows([{ stockItemId: '', quantity: '1' }]);
      setShowLinkModal(true);
    }
  };

  const handleAddLinkRow = () => {
    setLinkRows((prev) => [...prev, { stockItemId: '', quantity: '1' }]);
  };

  const handleRemoveLinkRow = (index: number) => {
    setLinkRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeLinkRow = (
    index: number,
    field: keyof LinkFormRow,
    value: string
  ) => {
    setLinkRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleSaveLinks = async () => {
    if (!linkingProduct) return;

    const cleanedLinks = linkRows
      .filter((row) => row.stockItemId && Number(row.quantity) > 0)
      .map((row) => ({
        stockItemId: row.stockItemId,
        quantity: Number(row.quantity),
      }));

    try {
      setSavingLinks(true);

      await api.put(`/product-stock-links/product/${linkingProduct.id}`, {
        links: cleanedLinks,
      });

      toast({ title: 'Vínculos de estoque atualizados', variant: 'success' });
      setShowLinkModal(false);
      setLinkingProduct(null);
      setLinkRows([]);
      void fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao salvar vínculos', description: 'Tente novamente.', variant: 'error' });
    } finally {
      setSavingLinks(false);
    }
  };

  const handleCloseLinkModal = () => {
    if (savingLinks) return;
    setShowLinkModal(false);
    setLinkingProduct(null);
    setLinkRows([]);
  };

  const getStockLinkLabel = (product: Product) => {
    const totalLinks = product.stockItems?.length || 0;

    if (totalLinks > 0) {
      return (
        <Badge variant="success" icon={<StockLinkIcon aria-hidden="true" size={14} />}>
          {totalLinks} vínculo{totalLinks > 1 ? 's' : ''} com estoque
        </Badge>
      );
    }

    return (
      <Badge variant="warning" icon={<WarningIcon aria-hidden="true" size={14} />}>
        Sem vínculo de estoque
      </Badge>
    );
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Produtos" description="Gerencie os produtos do cardápio" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" aria-label="Carregando produtos">
          {Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Gerencie os produtos do cardápio"
        actions={<Button leftIcon={<Plus aria-hidden="true" size={20} />} onClick={() => handleOpenModal()}>Novo Produto</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.length === 0 && (
          <EmptyState
            className="col-span-full"
            icon={<ProductIcon size={40} />}
            title="Nenhum produto cadastrado."
            description="Cadastre o primeiro produto para começar a montar o cardápio."
            action={<Button leftIcon={<Plus aria-hidden="true" size={20} />} onClick={() => handleOpenModal()}>Novo Produto</Button>}
          />
        )}

        {products.map((product) => (
          <Card key={product.id} className="overflow-hidden p-0">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-24 w-full object-cover"
              />
            ) : (
              <div className="flex h-24 w-full items-center justify-center bg-surface-sunken">
                <ProductIcon aria-hidden="true" className="text-subtle" size={32} />
              </div>
            )}

            <div className="p-card">
              <p className="text-heading text-default">{product.name}</p>
              <p className="mb-3 mt-1 line-clamp-2 min-h-8 text-caption text-muted">
                {product.description}
              </p>

              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="tabular-nums text-heading text-primary">
                  {formatCurrencyBRL(product.price)}
                  {product.isByWeight ? '/kg' : ''}
                </span>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    aria-label={`Editar ${product.name}`}
                    onClick={() => handleOpenModal(product)}
                    title="Editar produto"
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </Button>

                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    aria-label={`Excluir ${product.name}`}
                    onClick={() => handleOpenDeleteModal(product)}
                    title="Excluir produto"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </Button>
                </div>
              </div>

              <p className="mb-2 text-caption text-subtle">{product.category?.name}</p>

              {getStockLinkLabel(product)}

              <Button
                variant="secondary"
                fullWidth
                size="sm"
                leftIcon={<StockLinkIcon aria-hidden="true" size={16} />}
                className="mt-4"
                onClick={() => handleOpenLinkModal(product)}
              >
                Vincular estoque
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} size="md">
        <ModalHeader>
          <ModalTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</ModalTitle>
          <ModalDescription>Preencha os dados exibidos no cardápio.</ModalDescription>
        </ModalHeader>
        <ModalContent className="space-y-4">
          <Field label="Nome" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Descrição"><Textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <Field label="Preço (R$)" required><Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
            <Checkbox label="Vendido por KG" checked={form.isByWeight} onChange={(event) => setForm({ ...form, isByWeight: event.target.checked })} />
          </div>
          <Field label="Categoria" required>
            <Select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </Field>
          <Field label="URL da Imagem"><Input value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." /></Field>
        </ModalContent>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </ModalFooter>
      </Modal>

      <ConfirmDialog
        open={deleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        title="Excluir produto"
        description={`Você está prestes a excluir o produto ${productToDelete?.name ?? ''}. Esta ação não poderá ser desfeita.`}
        confirmLabel="Sim, excluir"
        variant="danger"
        loading={deleting}
      />

      <Modal open={showLinkModal && Boolean(linkingProduct)} onClose={handleCloseLinkModal} size="lg">
        <ModalHeader>
          <ModalTitle>Vincular estoque</ModalTitle>
          <ModalDescription>Produto: {linkingProduct?.name}. Defina os insumos baixados a cada venda.</ModalDescription>
        </ModalHeader>
        <ModalContent className="space-y-3">
          {linkRows.map((row, index) => (
            <Card key={index} className="grid gap-3 p-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
              <Field label="Insumo">
                <Select value={row.stockItemId} onChange={(event) => handleChangeLinkRow(index, 'stockItemId', event.target.value)}>
                  <option value="">Selecione um insumo</option>
                  {stockItems.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>)}
                </Select>
              </Field>
              <Field label="Quantidade"><Input type="number" min="0" step="0.01" value={row.quantity} onChange={(event) => handleChangeLinkRow(index, 'quantity', event.target.value)} /></Field>
              <Button variant="danger" size="sm" onClick={() => handleRemoveLinkRow(index)}>Remover</Button>
            </Card>
          ))}
          <Button variant="secondary" size="sm" leftIcon={<Plus aria-hidden="true" size={16} />} onClick={handleAddLinkRow}>Adicionar vínculo</Button>
        </ModalContent>
        <ModalFooter>
          <Button variant="secondary" onClick={handleCloseLinkModal} disabled={savingLinks}>Cancelar</Button>
          <Button onClick={handleSaveLinks} loading={savingLinks}>Salvar vínculos</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default ProductsPage;
