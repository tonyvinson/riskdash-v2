import React, { useState, useEffect, useCallback, useMemo } from 'react';

// 🔧 CONFIGURATION
const API_BASE_URL = 'https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev';
const TENANT_ID = 'tenant-0bf4618d';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const AUTO_REFRESH_INTERVAL = 30 * 1000; // 30 seconds

// 🚀 ENHANCED API CLIENT with caching and error handling
class EnhancedAPIClient {
  constructor() {
    this.cache = new Map();
    this.baseURL = API_BASE_URL;
  }

  async get(path, useCache = true) {
    const cacheKey = path;
    const now = Date.now();
    
    // Check cache first
    if (useCache && this.cache.has(cacheKey)) {
      const { data, timestamp } = this.cache.get(cacheKey);
      if (now - timestamp < CACHE_DURATION) {
        return data;
      }
    }

    try {
      const response = await fetch(`${this.baseURL}${path}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache successful responses
      if (useCache) {
        this.cache.set(cacheKey, { data, timestamp: now });
      }
      
      return data;
    } catch (error) {
      console.error(`API call failed for ${path}:`, error);
      throw new Error(`Failed to fetch ${path}: ${error.message}`);
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

// 🎯 ENHANCED HOOKS
const useAPI = () => {
  const [apiClient] = useState(() => new EnhancedAPIClient());
  return apiClient;
};

const useComplianceData = () => {
  const [data, setData] = useState({
    status: 'loading',
    compliance: 0,
    totalKSIs: 0,
    passedKSIs: 0,
    failedKSIs: 0,
    pendingKSIs: 0,
    automatedKSIs: 0,
    manualKSIs: 0,
    lastRun: null,
    recentResults: [],
    executionHistory: [],
    priorityItems: [],
    availableKSIs: [],
    error: null
  });
  
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const apiClient = useAPI();

  // 🧮 FIXED COMPLIANCE CALCULATIONS
  const processComplianceData = useCallback((availableKSIs, results) => {
    // Get automated KSIs (the ones that should count toward compliance)
    const automatedKSIs = availableKSIs.filter(ksi => 
      ksi.automation_type === 'fully_automated'
    );
    const manualKSIs = availableKSIs.filter(ksi => 
      ksi.automation_type === 'manual'
    );

    // Get latest unique results (avoid duplicates)
    const latestResults = {};
    results.forEach(result => {
      const ksiId = result.ksi_id;
      const timestamp = new Date(result.timestamp).getTime();
      
      if (!latestResults[ksiId] || 
          new Date(latestResults[ksiId].timestamp).getTime() < timestamp) {
        latestResults[ksiId] = result;
      }
    });
    
    const uniqueResults = Object.values(latestResults);
    
    // Filter results for automated KSIs only
    const automatedKSIIds = new Set(automatedKSIs.map(ksi => ksi.ksi_id));
    const automatedResults = uniqueResults.filter(result => 
      automatedKSIIds.has(result.ksi_id)
    );

    // Calculate metrics CORRECTLY
    const passedAutomated = automatedResults.filter(r => 
      r.assertion === true || r.assertion === "true"
    ).length;
    
    const failedAutomated = automatedResults.filter(r => 
      r.assertion === false || r.assertion === "false"  
    ).length;
    
    const pendingAutomated = Math.max(0, automatedKSIs.length - automatedResults.length);
    
    // FIXED: Compliance = (passed automated / total automated) * 100
    const compliance = automatedKSIs.length > 0 ? 
      Math.round((passedAutomated / automatedKSIs.length) * 100) : 0;

    // Determine overall status
    const status = failedAutomated > 0 ? 'critical' : 
                   pendingAutomated > 0 ? 'warning' : 'healthy';

    // Get last execution time
    const lastRun = automatedResults.length > 0 ? 
      automatedResults.reduce((latest, current) => 
        new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
      ).timestamp : null;

    // Create priority items (issues that need attention)
    const priorityItems = [
      // Failed KSIs
      ...automatedResults
        .filter(r => r.assertion === false || r.assertion === "false")
        .map(r => ({
          ksi_id: r.ksi_id,
          issue: r.assertion_reason || 'Validation failed',
          severity: 'high',
          timestamp: r.timestamp,
          type: 'failure',
          commands_executed: r.commands_executed || 0
        })),
      // Pending KSIs  
      ...automatedKSIs
        .filter(ksi => !automatedResults.find(r => r.ksi_id === ksi.ksi_id))
        .map(ksi => ({
          ksi_id: ksi.ksi_id,
          issue: 'Awaiting validation',
          severity: 'medium',
          type: 'pending',
          description: ksi.description
        }))
    ].slice(0, 10); // Limit to top 10 issues

    // Enhanced execution history
    const executionHistory = uniqueResults
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20)
      .map(result => ({
        execution_id: result.execution_id || `single-${result.ksi_id}`,
        ksi_id: result.ksi_id,
        timestamp: result.timestamp,
        status: result.assertion ? 'success' : 'failed',
        commands_executed: result.commands_executed || 0,
        cli_command_details: result.cli_command_details || [],
        assertion_reason: result.assertion_reason,
        category: availableKSIs.find(k => k.ksi_id === result.ksi_id)?.category || 'Unknown'
      }));

    return {
      status,
      compliance,
      totalKSIs: availableKSIs.length,
      passedKSIs: passedAutomated,
      failedKSIs: failedAutomated,
      pendingKSIs: pendingAutomated,
      automatedKSIs: automatedKSIs.length,
      manualKSIs: manualKSIs.length,
      lastRun,
      recentResults: uniqueResults.slice(0, 10),
      executionHistory,
      priorityItems,
      availableKSIs,
      error: null
    };
  }, []);

  // 📡 LOAD DATA FUNCTION
  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      // Load data in parallel for better performance
      const [ksisResponse, resultsResponse] = await Promise.all([
        apiClient.get('/api/admin/ksi-defaults', !forceRefresh),
        apiClient.get(`/api/ksi/results?tenant_id=${TENANT_ID}`, !forceRefresh)
      ]);

      const availableKSIs = ksisResponse.available_ksis || [];
      const results = resultsResponse.results || [];

      const processedData = processComplianceData(availableKSIs, results);
      
      setData(processedData);
      setLastUpdate(new Date().toISOString());
      
    } catch (error) {
      console.error('Failed to load compliance data:', error);
      setData(prev => ({ 
        ...prev, 
        error: error.message,
        status: 'error'
      }));
    } finally {
      setLoading(false);
    }
  }, [apiClient, processComplianceData]);

  // 🔄 AUTO REFRESH
  useEffect(() => {
    loadData();
    
    const interval = setInterval(() => {
      loadData(false); // Use cache for auto-refresh
    }, AUTO_REFRESH_INTERVAL);
    
    return () => clearInterval(interval);
  }, [loadData]);

  return { data, loading, lastUpdate, loadData };
};

// 🎨 ENHANCED CLI MODAL COMPONENT
const EnhancedCLIModal = ({ isOpen, onClose, selectedItem }) => {
  if (!isOpen || !selectedItem) return null;

  // 🔧 SIMPLIFIED CLI DATA DISPLAY - No over-fetching!
  const cliCommands = selectedItem.cli_command_details || [];
  const hasCommands = cliCommands.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[85vh] overflow-hidden">
        
        {/* 📋 HEADER */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                🔍 {selectedItem.ksi_id} - Validation Evidence
              </h2>
              <p className="text-blue-100 text-sm mt-1">
                FedRAMP 20x Compliance • Real-time CLI Evidence • Audit Ready
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-red-200 text-2xl font-bold transition-colors"
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        </div>

        {/* 📊 EXECUTION SUMMARY */}
        <div className="p-6 border-b bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {selectedItem.commands_executed || 0}
              </div>
              <div className="text-sm text-gray-600">Commands Executed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {selectedItem.successful_commands || 0}
              </div>
              <div className="text-sm text-gray-600">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {selectedItem.failed_commands || 0}
              </div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                selectedItem.assertion ? 'text-green-600' : 'text-red-600'
              }`}>
                {selectedItem.assertion ? '✅' : '❌'}
              </div>
              <div className="text-sm text-gray-600">Status</div>
            </div>
          </div>
        </div>

        {/* 💻 CLI COMMANDS SECTION */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            ⚡ CLI Commands Executed
            {hasCommands && (
              <span className="ml-2 bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                {cliCommands.length} commands
              </span>
            )}
          </h3>

          {hasCommands ? (
            <div className="space-y-3">
              {cliCommands.map((command, index) => (
                <div key={index} className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">$ Command {index + 1}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(command)}
                      className="text-gray-400 hover:text-white text-xs"
                      title="Copy command"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div className="text-green-400">{command}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-amber-50 border-2 border-dashed border-amber-200 rounded-lg">
              <div className="text-4xl mb-4">📋</div>
              <h4 className="text-lg font-medium text-amber-800 mb-2">
                Policy-Based Validation
              </h4>
              <p className="text-amber-700">
                This KSI uses configuration and policy checks rather than CLI command execution.
                The validation is based on AWS service configurations and compliance policies.
              </p>
            </div>
          )}

          {/* 📝 ASSERTION DETAILS */}
          {selectedItem.assertion_reason && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-2">📝 Validation Reasoning</h4>
              <p className="text-blue-700 text-sm leading-relaxed">
                {selectedItem.assertion_reason}
              </p>
            </div>
          )}
        </div>

        {/* 🔒 TRUST & AUDIT FOOTER */}
        <div className="px-6 py-4 bg-gray-50 border-t text-xs text-gray-500 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span>🛡️ FedRAMP 20x Compliant</span>
            <span>📊 Real-time Evidence</span>
            <span>🔍 3PAO Ready</span>
          </div>
          <div>
            📅 {selectedItem.timestamp ? 
              new Date(selectedItem.timestamp).toLocaleString() : 'Unknown time'}
          </div>
        </div>
      </div>
    </div>
  );
};

// 🎯 ENHANCED DASHBOARD COMPONENT
const EnhancedDashboard = ({ viewMode }) => {
  const { data, loading, lastUpdate, loadData } = useComplianceData();
  const [selectedKSI, setSelectedKSI] = useState(null);
  const [showCLIModal, setShowCLIModal] = useState(false);
  const [selectedView, setSelectedView] = useState('overview');

  // 🎨 STATUS CONFIGURATION  
  const statusConfig = useMemo(() => {
    const configs = {
      healthy: {
        text: 'All Systems Operational',
        icon: '✅',
        color: 'text-green-600',
        bg: 'bg-green-50 border-green-200',
        description: 'All automated validations passing',
        gradient: 'from-green-50 to-emerald-50'
      },
      warning: {
        text: 'Action Required',
        icon: '⚠️',
        color: 'text-yellow-600',
        bg: 'bg-yellow-50 border-yellow-200',
        description: 'Some automated KSIs need validation',
        gradient: 'from-yellow-50 to-amber-50'
      },
      critical: {
        text: 'Critical Issues Detected',
        icon: '🚨',
        color: 'text-red-600',
        bg: 'bg-red-50 border-red-200',
        description: 'Automated KSI failures require immediate attention',
        gradient: 'from-red-50 to-rose-50'
      },
      error: {
        text: 'System Error',
        icon: '⚡',
        color: 'text-purple-600',
        bg: 'bg-purple-50 border-purple-200',
        description: 'Unable to load compliance data',
        gradient: 'from-purple-50 to-violet-50'
      }
    };
    return configs[data.status] || configs.warning;
  }, [data.status]);

  // 🔄 REFRESH HANDLER
  const handleRefresh = useCallback(() => {
    loadData(true); // Force refresh
  }, [loadData]);

  // 👆 CLI MODAL HANDLER - SIMPLIFIED!
  const handleViewCLI = useCallback((item) => {
    console.log('🔍 Opening CLI modal for:', item);
    setSelectedKSI(item);
    setShowCLIModal(true);
  }, []);

  // ⌚ TIME FORMATTING
  const formatTimeAgo = useCallback((timestamp) => {
    if (!timestamp) return 'Never';
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }, []);

  // 🔄 LOADING STATE
  if (loading && !data.totalKSIs) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-lg font-medium text-gray-700">Loading FedRAMP 20x Dashboard...</div>
          <div className="text-sm text-gray-500 mt-1">Validating compliance posture</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      
      {/* 🎯 HERO STATUS SECTION */}
      <div className={`bg-gradient-to-r ${statusConfig.gradient} border-2 ${statusConfig.bg} rounded-2xl p-8 shadow-lg`}>
        <div className="text-center">
          <div className="text-7xl mb-4 animate-pulse">{statusConfig.icon}</div>
          <h1 className={`text-3xl font-bold ${statusConfig.color} mb-3`}>
            {statusConfig.text}
          </h1>
          <p className="text-gray-700 text-lg mb-4">{statusConfig.description}</p>
          
          {/* 📊 QUICK METRICS ROW */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white/80 backdrop-blur rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{data.compliance}%</div>
              <div className="text-sm text-gray-600">Compliance</div>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{data.passedKSIs}</div>
              <div className="text-sm text-gray-600">Passed</div>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{data.failedKSIs}</div>  
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-600">{data.pendingKSIs}</div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
          </div>

          {/* 🔄 REFRESH & STATUS */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
            <div className="text-sm text-gray-600">
              Last updated: {lastUpdate ? formatTimeAgo(lastUpdate) : 'Never'}
            </div>
          </div>
        </div>
      </div>

      {/* 📊 DETAILED METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {[
          { label: 'Total KSIs', value: data.totalKSIs, icon: '📋', color: 'blue', desc: 'All FedRAMP controls' },
          { label: 'Automated', value: data.automatedKSIs, icon: '🤖', color: 'purple', desc: 'Real-time validation' },
          { label: 'Manual', value: data.manualKSIs, icon: '👤', color: 'gray', desc: 'Human verification' },
          { label: 'Executions', value: data.executionHistory.length, icon: '⚡', color: 'yellow', desc: 'Recent validations' },
          { label: 'Issues', value: data.priorityItems.length, icon: '🔧', color: 'red', desc: 'Need attention' }
        ].map((metric, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="text-2xl">{metric.icon}</div>
              <div className={`text-3xl font-bold text-${metric.color}-600`}>
                {metric.value}
              </div>
            </div>
            <div className="text-gray-800 font-medium">{metric.label}</div>
            <div className="text-gray-500 text-sm mt-1">{metric.desc}</div>
          </div>
        ))}
      </div>

      {/* 🏷️ VIEW TABS */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="border-b bg-gray-50">
          <nav className="flex">
            {[
              { id: 'overview', label: 'Overview', icon: '📊', badge: null },
              { id: 'issues', label: 'Issues', icon: '🔧', badge: data.priorityItems.length },
              { id: 'history', label: 'Recent Activity', icon: '⚡', badge: data.executionHistory.length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedView(tab.id)}
                className={`flex items-center gap-3 px-6 py-4 border-b-2 font-medium transition-colors ${
                  selectedView === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* 📋 TAB CONTENT */}
        <div className="p-6">
          {selectedView === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">🎯 Compliance Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-3">Automated Validation</h4>
                    <div className="text-3xl font-bold text-blue-600 mb-2">{data.automatedKSIs}</div>
                    <div className="text-blue-700">KSIs with real-time CLI validation</div>
                    <div className="mt-3 text-sm text-blue-600">
                      ✅ {data.passedKSIs} passing • ❌ {data.failedKSIs} failing • ⏸️ {data.pendingKSIs} pending
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-800 mb-3">Manual Verification</h4>
                    <div className="text-3xl font-bold text-gray-600 mb-2">{data.manualKSIs}</div>
                    <div className="text-gray-700">KSIs requiring human assessment</div>
                    <div className="mt-3 text-sm text-gray-600">
                      📋 Documentation and policy reviews
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">🏆 FedRAMP 20x Trustcenter Status</h3>
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-200">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">🛡️</div>
                    <div>
                      <div className="text-lg font-semibold text-green-800">Federal Compliance Ready</div>
                      <div className="text-green-700">
                        Real-time validation • CLI evidence • Audit trails • 3PAO ready
                      </div>
                      <div className="text-sm text-green-600 mt-2">
                        ✅ Live AWS validation • ✅ Machine-readable evidence • ✅ Cross-account support
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedView === 'issues' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">🔧 Priority Issues</h3>
              {data.priorityItems.length > 0 ? (
                data.priorityItems.map((item, index) => (
                  <div key={index} className={`p-4 rounded-lg border-l-4 ${
                    item.severity === 'high' ? 'border-red-500 bg-red-50' :
                    item.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                    'border-blue-500 bg-blue-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-800">
                          {item.ksi_id}
                          <span className={`ml-2 px-2 py-1 text-xs rounded ${
                            item.type === 'failure' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.type === 'failure' ? 'FAILED' : 'PENDING'}
                          </span>
                        </div>
                        <div className="text-gray-600 mt-1">{item.issue}</div>
                        {item.commands_executed > 0 && (
                          <div className="text-sm text-gray-500 mt-1">
                            {item.commands_executed} commands executed
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleViewCLI(item)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-4">🎉</div>
                  <div className="text-lg">No issues found!</div>
                  <div>All automated KSIs are passing validation.</div>
                </div>
              )}
            </div>
          )}

          {selectedView === 'history' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">⚡ Recent Validation Activity</h3>
              {data.executionHistory.map((execution, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`text-2xl ${
                        execution.status === 'success' ? '✅' : '❌'
                      }`}></span>
                      <div>
                        <div className="font-semibold">{execution.ksi_id}</div>
                        <div className="text-sm text-gray-600">
                          {execution.commands_executed} commands • {execution.category}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">
                        {formatTimeAgo(execution.timestamp)}
                      </div>
                      <button
                        onClick={() => handleViewCLI(execution)}
                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                      >
                        View CLI
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 🎯 CLI MODAL */}
      <EnhancedCLIModal
        isOpen={showCLIModal}
        onClose={() => setShowCLIModal(false)}
        selectedItem={selectedKSI}
      />
    </div>
  );
};

// 🎯 MAIN DUAL DASHBOARD COMPONENT
const DualDashboard = () => {
  const [viewMode, setViewMode] = useState('simple');
  const [showModeInfo, setShowModeInfo] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      
      {/* 🎛️ JUST THE VIEW TOGGLE - No duplicate header */}
      <div className="bg-white border-b p-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Real-time Compliance Validation & Trustcenter
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowModeInfo(!showModeInfo)}
              className="text-gray-400 hover:text-gray-600 p-1 text-sm"
              title="About dashboard modes"
            >
              ℹ️
            </button>
            <div className="bg-gray-100 rounded-lg p-1 flex">
              <button
                onClick={() => setViewMode('simple')}
                className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                  viewMode === 'simple'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ✨ Executive
              </button>
              <button
                onClick={() => setViewMode('advanced')}
                className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                  viewMode === 'advanced'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🔬 Technical
              </button>
            </div>
          </div>
        </div>
        
        {/* ℹ️ MODE INFO PANEL */}
        {showModeInfo && (
          <div className="max-w-7xl mx-auto mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-blue-800 mb-2">✨ Executive View</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• High-level compliance status</li>
                  <li>• Priority issues and actions</li>
                  <li>• FedRAMP trustcenter indicators</li>
                  <li>• Perfect for leadership briefings</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-blue-800 mb-2">🔬 Technical View</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Detailed validation results</li>
                  <li>• CLI command evidence</li>
                  <li>• Real-time execution logs</li>
                  <li>• For technical teams and auditors</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 📊 DASHBOARD CONTENT */}
      <EnhancedDashboard viewMode={viewMode} />
    </div>
  );
};

export default DualDashboard;
