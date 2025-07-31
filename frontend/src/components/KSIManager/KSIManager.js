import React, { useState, useEffect } from 'react';
import { Shield, Users, Activity, Settings, Play, RefreshCw, CheckCircle, XCircle, Clock, Eye, Filter } from 'lucide-react';
import ksiService from '../../services/ksiService';

const KSIManager = () => {
  const [tenants, setTenants] = useState([]);
  const [availableKSIs, setAvailableKSIs] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tenantsData, ksisData] = await Promise.all([
        ksiService.getAllTenants(),
        ksiService.getAvailableKSIs()
      ]);
      
      setTenants(tenantsData.tenants || []);
      setAvailableKSIs(ksisData.available_ksis || []);
      
      // Auto-select first active tenant
      const activeTenants = (tenantsData.tenants || []).filter(t => t.status === 'active');
      if (activeTenants.length > 0 && !selectedTenant) {
        setSelectedTenant(activeTenants[0]);
        loadValidationData(activeTenants[0].tenant_id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const loadValidationData = async (tenantId) => {
    try {
      const [results, history] = await Promise.all([
        ksiService.getValidationResults(tenantId),
        ksiService.getExecutionHistory(tenantId)
      ]);
      setValidationResults(ksiService.formatValidationResults(results.results || []));
      setExecutionHistory(history.executions || []);
      setShowResults(true);
    } catch (error) {
      console.error('Error loading validation data:', error);
      setValidationResults([]);
      setExecutionHistory([]);
    }
  };

  const triggerValidation = async (tenantId, type = 'all') => {
    setIsValidating(true);
    try {
      let result;
      switch (type) {
        case 'all':
          result = await ksiService.triggerAllValidations(tenantId);
          break;
        case 'category':
          result = await ksiService.triggerCategoryValidation(tenantId, selectedCategory);
          break;
        default:
          result = await ksiService.triggerValidation(tenantId);
      }
      
      console.log('Validation triggered:', result);
      
      // Show immediate feedback
      setValidationResults([]);
      setExecutionHistory([]);
      
      // Refresh data after a few seconds to see results
      setTimeout(() => {
        loadValidationData(tenantId);
      }, 5000);
      
    } catch (error) {
      console.error('Validation trigger failed:', error);
    }
    setIsValidating(false);
  };

  const triggerSpecificKSIs = async (tenantId, ksiIds) => {
    setIsValidating(true);
    try {
      const result = await ksiService.triggerSpecificKSIs(tenantId, ksiIds);
      console.log('Specific KSIs validation triggered:', result);
      
      setTimeout(() => {
        loadValidationData(tenantId);
      }, 5000);
      
    } catch (error) {
      console.error('Specific KSI validation failed:', error);
    }
    setIsValidating(false);
  };

  const refreshResults = () => {
    if (selectedTenant) {
      loadValidationData(selectedTenant.tenant_id);
    }
  };

  const getKSIsByCategory = () => {
    const categories = {};
    availableKSIs.forEach(ksi => {
      const category = ksi.category || 'Unknown';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(ksi);
    });
    return categories;
  };

  const getValidationSummary = () => {
    return ksiService.calculateSummaryStats(validationResults);
  };

  const getResultsByCategory = () => {
    return ksiService.groupResultsByCategory(validationResults);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  const activeTenants = tenants.filter(t => t.status === 'active');
  const summary = getValidationSummary();
  const categories = getKSIsByCategory();
  const resultsByCategory = getResultsByCategory();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          📊 KSI Validator Dashboard
        </h1>
        <button
          onClick={refreshResults}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center">
            <Users className="text-blue-500 mr-3" size={24} />
            <div>
              <h3 className="text-lg font-semibold">Total Tenants</h3>
              <p className="text-2xl font-bold text-blue-600">{tenants.length}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <Shield className="text-green-500 mr-3" size={24} />
            <div>
              <h3 className="text-lg font-semibold">Available KSIs</h3>
              <p className="text-2xl font-bold text-green-600">{availableKSIs.length}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <Activity className="text-purple-500 mr-3" size={24} />
            <div>
              <h3 className="text-lg font-semibold">Active Tenants</h3>
              <p className="text-2xl font-bold text-purple-600">{activeTenants.length}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <CheckCircle className="text-yellow-500 mr-3" size={24} />
            <div>
              <h3 className="text-lg font-semibold">Pass Rate</h3>
              <p className="text-2xl font-bold text-yellow-600">{summary.passRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tenant Selection & Validation Controls */}
      {activeTenants.length > 0 && (
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">🚀 Validation Controls</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tenant Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Select Tenant</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                value={selectedTenant?.tenant_id || ''}
                onChange={(e) => {
                  const tenant = tenants.find(t => t.tenant_id === e.target.value);
                  setSelectedTenant(tenant);
                  if (tenant) loadValidationData(tenant.tenant_id);
                }}
              >
                <option value="">Select a tenant...</option>
                {activeTenants.map(tenant => (
                  <option key={tenant.tenant_id} value={tenant.tenant_id}>
                    {tenant.organization_name} ({tenant.tenant_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">Category Filter</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {Object.keys(categories).map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Validation Actions */}
            <div>
              <label className="block text-sm font-medium mb-2">Actions</label>
              <div className="space-y-2">
                <button
                  onClick={() => selectedTenant && triggerValidation(selectedTenant.tenant_id, 'all')}
                  disabled={!selectedTenant || isValidating}
                  className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center space-x-2"
                >
                  {isValidating ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                  <span>{isValidating ? 'Validating...' : 'Run All KSIs'}</span>
                </button>
                
                <button
                  onClick={() => selectedTenant && triggerValidation(selectedTenant.tenant_id, 'category')}
                  disabled={!selectedTenant || isValidating || selectedCategory === 'all'}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center space-x-2"
                >
                  <Filter size={16} />
                  <span>Run Category</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation Results Summary */}
      {showResults && validationResults.length > 0 && (
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">📊 Latest Validation Summary</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{summary.total}</div>
              <div className="text-sm text-blue-800">Total KSIs</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{summary.passed}</div>
              <div className="text-sm text-green-800">Passed</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
              <div className="text-sm text-red-800">Failed</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{summary.passRate}%</div>
              <div className="text-sm text-yellow-800">Pass Rate</div>
            </div>
          </div>

          {/* Results by Category */}
          <div className="space-y-4">
            {Object.entries(resultsByCategory).map(([category, results]) => {
              const categoryStats = ksiService.calculateSummaryStats(results);
              return (
                <div key={category} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{category}</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-green-600">{categoryStats.passed} passed</span>
                      <span className="text-sm text-red-600">{categoryStats.failed} failed</span>
                      <span className="text-sm font-medium">{categoryStats.passRate}% pass rate</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {results.map((result) => (
                      <div key={result.ksi_id} className={`p-3 rounded border-l-4 ${
                        result.assertion ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-sm">{result.ksi_id}</h4>
                          <span className={`px-2 py-1 text-xs rounded ${
                            result.assertion 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {result.statusText}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">{result.assertion_reason}</p>
                        <div className="text-xs text-gray-500">
                          <div>Commands: {result.commands_executed || 0}</div>
                          <div>Success: {result.successful_commands || 0}</div>
                          <div>Rate: {result.successRate || 0}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available KSIs with Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Available KSIs</h2>
        <div className="space-y-6">
          {Object.entries(categories).map(([category, ksis]) => (
            <div key={category} className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{category}</h3>
                <button
                  onClick={() => selectedTenant && triggerSpecificKSIs(selectedTenant.tenant_id, ksis.map(k => k.ksi_id))}
                  disabled={!selectedTenant || isValidating}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 flex items-center space-x-1"
                >
                  <Play size={14} />
                  <span>Run Category</span>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ksis.map((ksi) => (
                  <div key={ksi.ksi_id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-blue-600 text-sm">{ksi.ksi_id}</h4>
                      <button
                        onClick={() => selectedTenant && triggerSpecificKSIs(selectedTenant.tenant_id, [ksi.ksi_id])}
                        disabled={!selectedTenant || isValidating}
                        className="text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                        title="Run this KSI"
                      >
                        <Play size={14} />
                      </button>
                    </div>
                    <h5 className="font-medium text-gray-900 mb-2 text-sm">{ksi.title}</h5>
                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">{ksi.description}</p>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Commands: {ksi.command_count}</span>
                      <span>v{ksi.version}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tenants List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Tenants</h2>
        {tenants.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-gray-500">No tenants found. Create your first tenant using the onboarding process.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    AWS Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    KSIs Enabled
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tenants.map((tenant) => (
                  <tr key={tenant.tenant_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {tenant.organization_name}
                        </div>
                        <div className="text-sm text-gray-500">{tenant.tenant_id}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tenant.aws_account_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        tenant.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : tenant.status === 'onboarding'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tenant.enabled_ksis_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tenant.created_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => triggerValidation(tenant.tenant_id)}
                          disabled={isValidating || tenant.status !== 'active'}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 flex items-center space-x-1"
                        >
                          {isValidating ? <RefreshCw className="animate-spin" size={12} /> : <Play size={12} />}
                          <span>{isValidating ? 'Running' : 'Validate'}</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            setSelectedTenant(tenant);
                            loadValidationData(tenant.tenant_id);
                          }}
                          className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 flex items-center space-x-1"
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution History */}
      {showResults && executionHistory.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Recent Execution History</h2>
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Execution ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trigger Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    KSIs Validated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {executionHistory.slice(0, 5).map((execution) => (
                  <tr key={execution.execution_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {execution.execution_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(execution.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {execution.trigger_source}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {execution.ksis_validated || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        execution.status === 'completed' 
                          ? 'bg-green-100 text-green-800'
                          : execution.status === 'running'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {execution.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default KSIManager;
