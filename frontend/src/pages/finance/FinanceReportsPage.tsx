import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';

interface ReportData {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalOrders: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  topCustomers: { name: string; totalSpent: number; orderCount: number }[];
}

const FinanceReportsPage: React.FC = () => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const { data } = await api.get(`/finance/reports?period=${period}`);
        setReport(data);
      } catch (error) {
        console.error(error);
        // Dados mock para demonstração
        setReport({
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          totalOrders: 0,
          topProducts: [],
          topCustomers: [],
        });
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [period]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios Financeiros</h1>
          <p className="text-gray-500">Análise financeira do seu restaurante</p>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="input w-auto">
          <option value="today">Hoje</option>
          <option value="week">Esta Semana</option>
          <option value="month">Este Mês</option>
          <option value="year">Este Ano</option>
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg"><TrendingUp className="text-green-600" size={20} /></div>
            <p className="text-xs sm:text-sm text-gray-500">Faturamento</p>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-gray-900">{formatCurrencyBRL(report?.totalRevenue)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="text-red-600" size={20} /></div>
            <p className="text-xs sm:text-sm text-gray-500">Despesas</p>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-gray-900">{formatCurrencyBRL(report?.totalExpenses)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg"><DollarSign className="text-blue-600" size={20} /></div>
            <p className="text-xs sm:text-sm text-gray-500">Lucro Liquido</p>
          </div>
          <p className={`text-lg sm:text-2xl font-bold ${(report?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrencyBRL(report?.netProfit)}
          </p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-100 rounded-lg"><ShoppingCart className="text-yellow-600" size={20} /></div>
            <p className="text-xs sm:text-sm text-gray-500">Total de Pedidos</p>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-gray-900">{report?.totalOrders || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Produtos */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Produtos Mais Vendidos</h2>
          {(report?.topProducts || []).length === 0 ? (
            <p className="text-center text-gray-400 py-6">Nenhum dado disponível.</p>
          ) : (
            <div className="space-y-3">
              {report?.topProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">{index + 1}</span>
                    <span className="font-medium text-gray-900">{product.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrencyBRL(product.revenue)}</p>
                    <p className="text-xs text-gray-500">{product.quantity} vendidos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Clientes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Melhores Clientes</h2>
          {(report?.topCustomers || []).length === 0 ? (
            <p className="text-center text-gray-400 py-6">Nenhum dado disponível.</p>
          ) : (
            <div className="space-y-3">
              {report?.topCustomers.map((customer, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">{index + 1}</span>
                    <span className="font-medium text-gray-900">{customer.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrencyBRL(customer.totalSpent)}</p>
                    <p className="text-xs text-gray-500">{customer.orderCount} pedidos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceReportsPage;
