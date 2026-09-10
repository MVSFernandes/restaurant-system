import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useMenuViewers } from '../hooks/useMenuViewers';
import { ShoppingCart, Users, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import type { OrderStatus, OrderType } from '../types';
import {
  formatCurrencyBRL,
  getOrderStatusBadgeClass,
  getOrderStatusLabel,
  getOrderTypeLabel,
} from '../constants/orders';

interface RecentOrder {
  id: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  createdAt: string;
  customerName: string | null;
  tableNumber: number | null;
}

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  link?: string;
}> = ({ title, value, icon, color, link }) => {
  const content = (
    <div className={`card flex items-center gap-4 hover:shadow-lg transition-shadow ${link ? 'cursor-pointer' : ''}`}>
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );

  if (link) {
    return <Link to={link}>{content}</Link>;
  }

  return content;
};

const WaiterMiniCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  link?: string;
  compact?: boolean;
}> = ({ title, value, icon, color, link, compact = false }) => {
  const content = (
    <div
      className={`card flex items-center gap-3 ${
        compact ? 'p-4' : 'p-4 sm:p-5'
      } ${link ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
    >
      <div className={`p-2.5 rounded-xl ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-gray-500 leading-tight ${compact ? 'text-xs' : 'text-xs sm:text-sm'}`}>
          {title}
        </p>
        <p className="text-2xl font-bold text-gray-900 leading-none mt-1">{value}</p>
      </div>
    </div>
  );

  return link ? <Link to={link}>{content}</Link> : content;
};

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = React.useState({
    totalOrders: 0,
    totalRevenue: 0,
    occupiedTables: 0,
    lowStockItems: 0,
  });
  const [recentOrders, setRecentOrders] = React.useState<RecentOrder[]>([]);
  const onlineUsers = useMenuViewers();
  const [loadingStats, setLoadingStats] = React.useState(true);
  const [loadingRecentOrders, setLoadingRecentOrders] = React.useState(true);
  const [recentOrdersError, setRecentOrdersError] = React.useState('');

  React.useEffect(() => {
    let active = true;
    setLoadingStats(true);

    const fetchStats = async () => {
      try {
        if (user?.role === 'WAITER') {
          const [ordersRes, tablesRes] = await Promise.all([api.get('/orders?myOrders=true'), api.get('/tables')]);

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const myOrdersToday = (ordersRes.data || []).filter((order: any) => {
            const createdAt = new Date(order.createdAt);
            return createdAt >= todayStart && order.status !== 'CANCELED';
          });

          const occupied = (tablesRes.data || []).filter((t: any) => t.status === 'OCCUPIED').length;

          if (active) {
            setStats({
              totalOrders: myOrdersToday.length,
              totalRevenue: 0,
              occupiedTables: occupied,
              lowStockItems: 0,
            });
          }
          return;
        }

        const [statsRes, tablesRes, stockRes] = await Promise.all([
          api.get('/finance/reports?period=today'),
          api.get('/tables'),
          api.get('/stock'),
        ]);

        const occupied = (tablesRes.data || []).filter((t: any) => t.status === 'OCCUPIED').length;
        const lowStock = (stockRes.data || []).filter((s: any) => s.quantity <= s.minQuantity).length;

        if (active) {
          setStats({
            totalOrders: Number(statsRes.data?.totalOrders || 0),
            totalRevenue: Number(statsRes.data?.totalRevenue || 0),
            occupiedTables: occupied,
            lowStockItems: lowStock,
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setLoadingStats(false);
      }
    };

    const fetchRecentOrders = async (showLoading = false) => {
      try {
        if (showLoading) setLoadingRecentOrders(true);
        const myOrders = user?.role === 'WAITER' ? '&myOrders=true' : '';
        const { data } = await api.get(`/orders/recent?limit=5${myOrders}`);
        if (!active) return;

        setRecentOrders(data || []);
        setRecentOrdersError('');
      } catch (error) {
        console.error(error);
        if (active) setRecentOrdersError('Não foi possível carregar os pedidos recentes.');
      } finally {
        if (active) setLoadingRecentOrders(false);
      }
    };

    fetchStats();
    fetchRecentOrders(true);

    const intervalId = window.setInterval(() => {
      fetchRecentOrders();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [user?.role]);

  const orderMeta = (order: RecentOrder) => {
    const customer = order.type !== 'DINE_IN' && order.customerName ? ` • ${order.customerName}` : '';
    return `${getOrderTypeLabel(order)}${customer} • ${formatCurrencyBRL(order.total)}`;
  };

  const renderRecentOrders = (emptyMessage = 'Nenhum pedido recente') => {
    if (loadingRecentOrders) {
      return (
        <div className="space-y-3" aria-label="Carregando pedidos recentes">
          {[0, 1, 2].map((item) => (
            <div key={item} className="animate-pulse rounded-lg bg-gray-50 p-3">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="mt-2 h-3 w-44 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      );
    }

    if (recentOrdersError) {
      return (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {recentOrdersError}
        </div>
      );
    }

    if (recentOrders.length === 0) {
      return (
        <div className="text-center py-8 text-gray-400">
          <ShoppingCart size={48} className="mx-auto mb-2 opacity-50" />
          <p>{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {recentOrders.map((order) => (
          <div key={order.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50">
            <div className="min-w-0">
              <p className="font-medium text-gray-900">Pedido #{order.id.slice(-6).toUpperCase()}</p>
              <p className="text-sm text-gray-500 truncate">{orderMeta(order)}</p>
            </div>
            <span className={`badge shrink-0 ${getOrderStatusBadgeClass(order.status)}`}>
              {getOrderStatusLabel(order.status)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (user?.role === 'WAITER') {
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Bem-vindo, {user?.name}!</h1>
          <p className="text-gray-500">Aqui está o seu resumo de atendimento de hoje.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <WaiterMiniCard
            title="Meus Pedidos Hoje"
            value={loadingStats ? '...' : stats.totalOrders.toString()}
            icon={<ShoppingCart className="text-blue-600" size={22} />}
            color="bg-blue-100"
            link="/waiter/history"
          />
          <WaiterMiniCard
            title="Mesas Ocupadas"
            value={loadingStats ? '...' : stats.occupiedTables.toString()}
            icon={<Users className="text-purple-600" size={22} />}
            color="bg-purple-100"
            link="/waiter/tables"
          />
        </div>

        <div className="mb-6 max-w-sm">
          <WaiterMiniCard
            title="Pessoas vendo o cardápio agora"
            value={onlineUsers.toString()}
            icon={<Users className="text-primary-600" size={22} />}
            color="bg-primary-100"
            compact
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock size={20} className="text-primary-500" />
              Ações Rápidas
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <Link to="/waiter/tables" className="btn-primary text-center py-3 rounded-xl">
                Abrir Mesa
              </Link>
              <Link to="/waiter/tables" className="btn-secondary text-center py-3 rounded-xl">
                Novo Pedido
              </Link>
              <Link to="/waiter/history" className="btn-secondary text-center py-3 rounded-xl">
                Ver Meu Histórico
              </Link>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-primary-500" />
              Meus Pedidos Recentes
            </h2>
            {renderRecentOrders('Nenhum pedido recente')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bem-vindo, {user?.name}!</h1>
        <p className="text-gray-500">Aqui está o resumo do seu restaurante hoje.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Pedidos Hoje"
          value={loadingStats ? '...' : stats.totalOrders.toString()}
          icon={<ShoppingCart className="text-blue-600" size={24} />}
          color="bg-blue-100"
          link="/pdv/orders"
        />
        <StatCard
          title="Mesas Ocupadas"
          value={loadingStats ? '...' : stats.occupiedTables.toString()}
          icon={<Users className="text-purple-600" size={24} />}
          color="bg-purple-100"
          link="/pdv/tables"
        />
        <StatCard
          title="Alertas de Estoque"
          value={loadingStats ? '...' : stats.lowStockItems.toString()}
          icon={<AlertTriangle className="text-red-600" size={24} />}
          color="bg-red-100"
          link="/inventory/stock"
        />
        <StatCard
          title="Faturamento Hoje"
          value={loadingStats ? '...' : formatCurrencyBRL(stats.totalRevenue)}
          icon={<TrendingUp className="text-green-600" size={24} />}
          color="bg-green-100"
          link="/finance/reports"
        />
      </div>

      <div className="mb-6 bg-primary-600 rounded-2xl p-6 text-white flex items-center justify-between shadow-lg shadow-primary-200">
        <div>
          <h2 className="text-lg font-medium opacity-90">Pessoas vendo o cardápio agora</h2>
          <p className="text-4xl font-bold mt-1" role="status" aria-live="polite">{onlineUsers}</p>
        </div>
        <div className="bg-white/20 p-4 rounded-full">
          <Users size={40} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-primary-500" />
            Ações Rápidas
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/pdv/tables" className="btn-primary text-center py-3 rounded-xl">
              Abrir Mesa
            </Link>
            <Link to="/pdv/orders" className="btn-secondary text-center py-3 rounded-xl">
              Novo Pedido
            </Link>
            <Link to="/menu/products" className="btn-secondary text-center py-3 rounded-xl">
              Gerenciar Cardápio
            </Link>
            <Link to="/finance/reports" className="btn-secondary text-center py-3 rounded-xl">
              Ver Relatórios
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-primary-500" />
            Pedidos Recentes
          </h2>
          {renderRecentOrders('Nenhum pedido recente')}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
