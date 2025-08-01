import React, { useState, useEffect } from 'react';
import { 
  Settings, Play, Pause, Edit3, Save, RefreshCw, AlertCircle, 
  CheckCircle2, Clock, Zap, User, Database, Filter, Search,
  BarChart3, Calendar, Plus, Trash2, Eye, EyeOff, Upload, Info
} from 'lucide-react';

// KSI Family definitions based on your actual DynamoDB data
const KSI_FAMILIES = {
  'CNA': { name: 'Cloud Native Architecture', color: 'bg-blue-50 border-blue-200', icon: '🏗️' },
  'SVC': { name: 'Service Configuration', color: 'bg-green-50 border-green-200', icon: '⚙️' },
  'IAM': { name: 'Identity & Access Management', color: 'bg-purple-50 border-purple-200', icon: '🔐' },
  'MLA': { name: 'Monitoring, Logging & Analysis', color: 'bg-orange-50 border-orange-200', icon: '📊' },
  'CMT': { name: 'Configuration Management & Testing', color: 'bg-indigo-50 border-indigo-200', icon: '🔧' },
  'PIY': { name: 'Policy and Inventory', color: 'bg-pink-50 border-pink-200', icon: '📋' },
  'TPR': { name: 'Third Party Resources', color: 'bg-yellow-50 border-yellow-200', icon: '🔗' },
  'RPL': { name: 'Recovery & Resilience', color: 'bg-red-50 border-red-200', icon: '🔄' },
  'CED': { name: 'Cybersecurity Education', color: 'bg-teal-50 border-teal-200', icon: '🎓' },
  'INR': { name: 'Incident & Non-Compliance Response', color: 'bg-gray-50 border-gray-200', icon: '🚨' }
};

const RealKSIManagement = ({ onConfigurationSaved, onNotification }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTenant, setSelectedTenant] = useState('tenant-0bf4618d');
  
  // Real data states matching your DynamoDB structure
  const [availableKSIs, setAvailableKSIs] = useState([]); // From API
  const [tenantData, setTenantData] = useState(null); // Current tenant config
  const [executionHistory, setExecutionHistory] = useState([]);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedAutomation, setSelectedAutomation] = useState('all'); // NEW: Automation filter
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
  
  // Configuration states
  const [pendingChanges, setPendingChanges] = useState(new Set()); // Track which KSIs changed
  const [selectedKSIs, setSelectedKSIs] = useState(new Set());

  useEffect(() => {
    loadAllRealData();
  }, [selectedTenant]);

  const loadAllRealData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadAvailableKSIs(),
        loadTenantConfiguration(),
        loadExecutionHistory()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      onNotification('Error loading KSI data. Please check API connectivity.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableKSIs = async () => {
    try {
      const apiUrl = 'https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev';
      const response = await fetch(`${apiUrl}/api/admin/ksi-defaults`);
      const data = await response.json();
      
      // FIXED: Handle array of KSI objects (not strings)
      const ksiList = data.available_ksis || data.ksi_defaults || data.available_ksi || [];
      
      const transformedKSIs = ksiList.map(ksiObj => ({
        ksi_id: ksiObj.ksi_id,                                    // Extract ksi_id from object
        family: extractFamily(ksiObj.ksi_id),                    // Pass string to extractFamily
        familyInfo: KSI_FAMILIES[extractFamily(ksiObj.ksi_id)] || { 
          name: 'Unknown', 
          color: 'bg-gray-50 border-gray-200', 
          icon: '❓' 
        },
        title: ksiObj.title || `${extractFamily(ksiObj.ksi_id)} Rule`,              // Use actual title from API
        category: ksiObj.category || getFullCategoryName(extractFamily(ksiObj.ksi_id)), // Use actual category  
        description: ksiObj.description || `Validation rule for ${ksiObj.ksi_id}`,  // Use actual description
        automation_type: ksiObj.automation_type || 'manual',                       // Use actual automation_type
        status: ksiObj.status || 'active',                                         // Use actual status
        validation_steps: ksiObj.validation_steps || 0                             // Use actual validation_steps count
      }));
      
      setAvailableKSIs(transformedKSIs);
      console.log('📋 Loaded available KSIs:', transformedKSIs.length);
      
    } catch (error) {
      console.error('Error loading available KSIs:', error);
      setAvailableKSIs([]);
    }
  };

  const loadTenantConfiguration = async () => {
    try {
      console.log(`🏢 Loading REAL tenant configuration for: ${selectedTenant}`);
      
      const apiUrl = 'https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev';
      
      // ACTUAL API CALL to get tenant data from DynamoDB
      const response = await fetch(`${apiUrl}/api/admin/tenants/${selectedTenant}`);
      
      if (!response.ok) {
        console.error(`❌ Failed to load tenant: HTTP ${response.status}`);
        throw new Error(`Failed to load tenant: ${response.status}`);
      }
      
      const data = await response.json();
      const tenantData = data.tenant;
      
      if (!tenantData) {
        console.error('❌ No tenant data returned from API');
        throw new Error('Tenant not found');
      }
      
      console.log('✅ Loaded REAL tenant data from DynamoDB:', {
        tenant_id: tenantData.tenant_id,
        organization: tenantData.organization?.name,
        enabled_ksis_count: tenantData.enabled_ksis?.length || 0,
        enabled_ksis: tenantData.enabled_ksis
      });
      
      setTenantData(tenantData);
      
    } catch (error) {
      console.error('❌ Error loading tenant configuration:', error);
      
      // Fallback to minimal tenant structure if API fails
      const fallbackTenantData = {
        tenant_id: selectedTenant,
        organization: { name: 'Unknown Organization' },
        status: 'active',
        enabled_ksis: [], // Empty array, not hardcoded values
        preferences: {
          validation_frequency: 'daily',
          notification_email: ''
        },
        ksi_schedule: 'daily'
      };
      
      setTenantData(fallbackTenantData);
      onNotification('Error loading tenant data from API. Using fallback.', 'warning');
    }
  };

  const loadExecutionHistory = async () => {
    try {
      const apiUrl = 'https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev';
      const response = await fetch(`${apiUrl}/api/ksi/executions?tenant_id=${selectedTenant}&limit=20`);
      const data = await response.json();
      
      setExecutionHistory(data.executions || []);
      console.log('📊 Loaded execution history:', data.executions?.length || 0);
      
    } catch (error) {
      console.error('Error loading execution history:', error);
      setExecutionHistory([]);
    }
  };

  const extractFamily = (ksiId) => {
    if (!ksiId) return 'UNK';
    const parts = ksiId.split('-');
    return parts.length >= 2 ? parts[1] : 'UNK';
  };

  const getFullCategoryName = (familyCode) => {
    const family = KSI_FAMILIES[familyCode];
    return family ? family.name : 'Unknown Category';
  };

  // ENHANCED: Updated filtering with automation filter
  const getFilteredKSIs = () => {
    let filtered = [...availableKSIs];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(ksi => 
        ksi.ksi_id?.toLowerCase().includes(term) ||
        ksi.title?.toLowerCase().includes(term) ||
        ksi.category?.toLowerCase().includes(term)
      );
    }

    // Apply family filter
    if (selectedFamily !== 'all') {
      filtered = filtered.filter(ksi => ksi.family === selectedFamily);
    }

    // NEW: Apply automation filter
    if (selectedAutomation !== 'all') {
      if (selectedAutomation === 'automated') {
        filtered = filtered.filter(ksi => 
          ksi.automation_type === 'fully_automated' || 
          (ksi.validation_steps > 0 && ksi.automation_type !== 'manual')
        );
      } else if (selectedAutomation === 'partial') {
        filtered = filtered.filter(ksi => ksi.automation_type === 'partially_automated');
      } else if (selectedAutomation === 'manual') {
        filtered = filtered.filter(ksi => 
          ksi.automation_type === 'manual' && (ksi.validation_steps === 0 || !ksi.validation_steps)
        );
      }
    }

    // Apply status filter
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'enabled') {
        filtered = filtered.filter(ksi => tenantData?.enabled_ksis?.includes(ksi.ksi_id));
      } else if (selectedStatus === 'disabled') {
        filtered = filtered.filter(ksi => !tenantData?.enabled_ksis?.includes(ksi.ksi_id));
      }
    }

    // Apply enabled-only filter
    if (showOnlyEnabled) {
      filtered = filtered.filter(ksi => tenantData?.enabled_ksis?.includes(ksi.ksi_id));
    }

    return filtered;
  };

  const handleKSIToggle = (ksiId, enabled) => {
    if (enabled) {
      // Add to enabled KSIs if not already there
      if (!tenantData?.enabled_ksis?.includes(ksiId)) {
        setTenantData(prev => ({
          ...prev,
          enabled_ksis: [...(prev?.enabled_ksis || []), ksiId]
        }));
        setPendingChanges(prev => new Set(prev).add(ksiId));
      }
    } else {
      // Remove from enabled KSIs
      setTenantData(prev => ({
        ...prev,
        enabled_ksis: (prev?.enabled_ksis || []).filter(id => id !== ksiId)
      }));
      setPendingChanges(prev => new Set(prev).add(ksiId));
    }
  };

  const handleBulkToggle = (ksiIds, enabled) => {
    ksiIds.forEach(ksiId => handleKSIToggle(ksiId, enabled));
  };

  const saveConfiguration = async () => {
    try {
      setSaving(true);
      
      const apiUrl = 'https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev';
      const updatePayload = {
        tenant_id: selectedTenant,
        enabled_ksis: tenantData?.enabled_ksis || [],
        preferences: tenantData?.preferences || {}
      };

      console.log('💾 Saving configuration:', {
        tenant_id: selectedTenant,
        enabled_ksis: tenantData?.enabled_ksis,
        changes: Array.from(pendingChanges),
        payload: updatePayload
      });

      // ACTUAL API CALL (not simulation!)
      const response = await fetch(`${apiUrl}/api/admin/tenants/${selectedTenant}/ksi-config`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      });

      console.log(`📡 API Response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Configuration saved successfully:', result);

      // Clear pending changes ONLY after successful save
      setPendingChanges(new Set());

      // Show success notification
      onNotification(
        `Configuration saved successfully! ${tenantData?.enabled_ksis?.length || 0} KSIs enabled.`, 
        'success'
      );

      // Notify parent component
      onConfigurationSaved({
        enabled_ksis: tenantData?.enabled_ksis?.length || 0,
        updated_count: pendingChanges.size,
        tenant_id: selectedTenant
      });

      // Emit event for dashboard refresh
      window.dispatchEvent(new CustomEvent('ksi-config-updated'));

      // Reload data to reflect changes from server
      await loadAllRealData();

    } catch (error) {
      console.error('❌ Error saving configuration:', error);
      onNotification(`Error saving configuration: ${error.message}`, 'error');
      
      // Don't clear pending changes on error so user can retry
    } finally {
      setSaving(false);
    }
  };

  const triggerValidation = async (ksiIds = null) => {
    try {
      const apiUrl = 'https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev';
      
      const payload = {
        tenant_id: selectedTenant,
        trigger_source: 'ksi_management_portal'
      };

      if (ksiIds && ksiIds.length > 0) {
        payload.ksi_filter = ksiIds;
        payload.trigger_source = 'ksi_management_selective';
      }

      const response = await fetch(`${apiUrl}/api/ksi/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      
      if (response.ok) {
        onNotification(
          ksiIds ? 
            `Validation triggered for ${ksiIds.length} selected KSIs` : 
            'Full validation triggered for all enabled KSIs', 
          'success'
        );
      } else {
        throw new Error(result.error || 'Validation trigger failed');
      }
    } catch (error) {
      console.error('Error triggering validation:', error);
      onNotification(`Error triggering validation: ${error.message}`, 'error');
    }
  };

  // ENHANCED: Updated stats with automation breakdown
  const getKSIStats = () => {
    const enabledKSIs = tenantData?.enabled_ksis || [];
    const filteredKSIs = getFilteredKSIs();
    
    return {
      total: availableKSIs.length,
      enabled: enabledKSIs.length,
      disabled: availableKSIs.length - enabledKSIs.length,
      pending_changes: pendingChanges.size,
      filtered: filteredKSIs.length
    };
  };

  // NEW: Automation stats calculation
  const getAutomationStats = () => {
    const automated = availableKSIs.filter(ksi => 
      ksi.automation_type === 'fully_automated' || 
      (ksi.validation_steps > 0 && ksi.automation_type !== 'manual')
    ).length;
    
    const partial = availableKSIs.filter(ksi => 
      ksi.automation_type === 'partially_automated'
    ).length;
    
    const manual = availableKSIs.filter(ksi => 
      ksi.automation_type === 'manual' && (ksi.validation_steps === 0 || !ksi.validation_steps)
    ).length;
    
    const totalCommands = availableKSIs.reduce((sum, ksi) => sum + (ksi.validation_steps || 0), 0);
    
    return { automated, partial, manual, totalCommands };
  };

  // NEW: Get automation display info
  const getAutomationDisplay = (automationType, commandCount) => {
    const isAutomated = automationType === 'fully_automated' || (commandCount > 0 && automationType !== 'manual');
    const isPartial = automationType === 'partially_automated';
    
    if (isAutomated && !isPartial) {
      return {
        label: 'Automated',
        color: 'bg-green-100 text-green-800',
        icon: '🤖'
      };
    } else if (isPartial) {
      return {
        label: 'Partial',
        color: 'bg-yellow-100 text-yellow-800', 
        icon: '⚡'
      };
    } else {
      return {
        label: 'Manual',
        color: 'bg-gray-100 text-gray-800',
        icon: '👤'
      };
    }
  };

  const renderOverviewTab = () => {
    const stats = getKSIStats();
    const automationStats = getAutomationStats(); // NEW
    const familyStats = Object.keys(KSI_FAMILIES).map(family => {
      const familyKSIs = availableKSIs.filter(ksi => ksi.family === family);
      const enabledInFamily = familyKSIs.filter(ksi => tenantData?.enabled_ksis?.includes(ksi.ksi_id));
      
      return {
        family,
        ...KSI_FAMILIES[family],
        total: familyKSIs.length,
        enabled: enabledInFamily.length
      };
    }).filter(stat => stat.total > 0);

    return (
      <div className="space-y-6">
        {/* Current Configuration Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Info className="text-blue-600 mt-0.5" size={20} />
            <div>
              <h4 className="font-medium text-blue-900 mb-1">Real DynamoDB Integration</h4>
              <p className="text-sm text-blue-800 mb-2">
                Managing KSI configuration for tenant: <strong>{tenantData?.organization?.name}</strong>
              </p>
              <div className="text-xs text-blue-700 space-y-1">
                <div>• Current enabled KSIs: {JSON.stringify(tenantData?.enabled_ksis || [])}</div>
                <div>• Table: <code>ksi-mvp-tenants-dev</code> → enabled_ksis array</div>
                <div>• Validation frequency: {tenantData?.preferences?.validation_frequency}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ENHANCED: Stats Cards with Automation */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-sm text-gray-600">Total KSIs</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.enabled}</div>
            <div className="text-sm text-gray-600">Enabled</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.disabled}</div>
            <div className="text-sm text-gray-600">Disabled</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600 flex items-center justify-center space-x-1">
              <span>🤖</span>
              <span>{automationStats.automated}</span>
            </div>
            <div className="text-sm text-gray-600">Automated</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center space-x-1">
              <span>⚡</span>
              <span>{automationStats.partial}</span>
            </div>
            <div className="text-sm text-gray-600">Partial</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-600 flex items-center justify-center space-x-1">
              <span>👤</span>
              <span>{automationStats.manual}</span>
            </div>
            <div className="text-sm text-gray-600">Manual</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{automationStats.totalCommands}</div>
            <div className="text-sm text-gray-600">Commands</div>
          </div>
        </div>

        {/* Family Overview */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">KSI Families Overview</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {familyStats.map(family => (
                <div key={family.family} className={`border rounded-lg p-4 ${family.color}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{family.icon}</span>
                    <span className="text-sm font-medium">{family.family}</span>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-2 text-sm">{family.name}</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="font-medium">{family.total}</div>
                      <div className="text-gray-600 text-xs">Total</div>
                    </div>
                    <div>
                      <div className="font-medium text-green-600">{family.enabled}</div>
                      <div className="text-gray-600 text-xs">Enabled</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ENHANCED: Recent Activity with better execution type detection */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Execution Activity</h3>
          </div>
          <div className="p-6">
            {executionHistory.slice(0, 5).map((execution, index) => {
              // Enhanced trigger source detection
              const isScheduled = execution.trigger_source?.includes('scheduled');
              const isTest = execution.trigger_source?.includes('test');
              const isManual = execution.trigger_source?.includes('ksi_management');
              
              let executionType, executionIcon, executionColor;
              
              if (isScheduled) {
                executionType = isTest ? 'Test Scheduled Validation' : 'Scheduled Validation';
                executionIcon = '🕐';
                executionColor = 'bg-green-500';
              } else if (isManual) {
                executionType = 'Manual Validation';
                executionIcon = '👤';
                executionColor = 'bg-blue-500';
              } else {
                executionType = 'API Validation';
                executionIcon = '🔄';
                executionColor = 'bg-purple-500';
              }
              
              return (
                <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 ${executionColor} rounded-full flex items-center justify-center`}>
                      <span className="text-xs text-white" style={{fontSize: '8px'}}>{executionIcon}</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium flex items-center space-x-2">
                        <span>{executionType}</span>
                        {isScheduled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Automated
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center space-x-2">
                        <span>{execution.ksis_validated} KSIs validated</span>
                        <span>•</span>
                        <span>ID: {execution.execution_id?.slice(-8)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">
                      {new Date(execution.timestamp).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-400">
                      {execution.trigger_source}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {executionHistory.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Clock size={48} className="mx-auto mb-2 text-gray-300" />
                <p>No validation executions yet</p>
                <p className="text-sm">Scheduled validations will appear here automatically</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderConfigurationTab = () => {
    const filteredKSIs = getFilteredKSIs();
    const pendingCount = pendingChanges.size;

    return (
      <div className="space-y-6">
        {/* Control Bar */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* ENHANCED: Search and Filters with Automation */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search KSIs..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <select
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Families</option>
                {Object.entries(KSI_FAMILIES).map(([key, family]) => (
                  <option key={key} value={key}>{family.name}</option>
                ))}
              </select>

              {/* NEW: Automation Filter */}
              <select
                value={selectedAutomation}
                onChange={(e) => setSelectedAutomation(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Automation</option>
                <option value="automated">🤖 Automated</option>
                <option value="partial">⚡ Partial</option>
                <option value="manual">👤 Manual</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showOnlyEnabled}
                  onChange={(e) => setShowOnlyEnabled(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enabled only</span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {pendingCount > 0 && (
                <button
                  onClick={saveConfiguration}
                  disabled={saving}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                  <span>Save Changes ({pendingCount})</span>
                </button>
              )}
              
              <button
                onClick={() => triggerValidation()}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <Play size={16} />
                <span>Run Enabled KSIs</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedKSIs.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-900">
                  {selectedKSIs.size} KSIs selected
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    handleBulkToggle(Array.from(selectedKSIs), true);
                    setSelectedKSIs(new Set());
                  }}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  Enable Selected
                </button>
                <button
                  onClick={() => {
                    handleBulkToggle(Array.from(selectedKSIs), false);
                    setSelectedKSIs(new Set());
                  }}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                >
                  Disable Selected
                </button>
                <button
                  onClick={() => setSelectedKSIs(new Set())}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ENHANCED: KSI Configuration Table with Automation & Commands */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              KSI Configuration ({filteredKSIs.length} rules)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedKSIs.size === filteredKSIs.length && filteredKSIs.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedKSIs(new Set(filteredKSIs.map(ksi => ksi.ksi_id)));
                        } else {
                          setSelectedKSIs(new Set());
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    KSI ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Family
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Automation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commands
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredKSIs.map((ksi) => {
                  const isEnabled = tenantData?.enabled_ksis?.includes(ksi.ksi_id);
                  const isModified = pendingChanges.has(ksi.ksi_id);
                  
                  const automation = getAutomationDisplay(ksi.automation_type, ksi.validation_steps);
                  const commandCount = ksi.validation_steps || 0;

                  return (
                    <tr key={ksi.ksi_id} className={isModified ? 'bg-yellow-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedKSIs.has(ksi.ksi_id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedKSIs);
                            if (e.target.checked) {
                              newSelected.add(ksi.ksi_id);
                            } else {
                              newSelected.delete(ksi.ksi_id);
                            }
                            setSelectedKSIs(newSelected);
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">{ksi.ksi_id}</span>
                          {isModified && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              Modified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">{ksi.familyInfo.icon}</span>
                          <span className="text-sm text-gray-900">{ksi.family}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{ksi.title}</div>
                        <div className="text-xs text-gray-500">{ksi.category}</div>
                      </td>
                      {/* NEW: Automation Column */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm">{automation.icon}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${automation.color}`}>
                            {automation.label}
                          </span>
                        </div>
                      </td>
                      {/* NEW: Commands Column */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">{commandCount}</span>
                          <span className="text-xs text-gray-500">
                            {commandCount === 1 ? 'cmd' : 'cmds'}
                          </span>
                        </div>
                        {commandCount > 0 && (
                          <div className="text-xs text-blue-600 mt-1">
                            AWS CLI Ready
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => handleKSIToggle(ksi.ksi_id, e.target.checked)}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500 mr-2"
                          />
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            isEnabled 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => triggerValidation([ksi.ksi_id])}
                            disabled={!isEnabled}
                            className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                            title="Trigger Validation"
                          >
                            <Play size={16} />
                          </button>
                          {commandCount > 0 && (
                            <button
                              onClick={() => {
                                // Show command details in a modal or console
                                console.log(`KSI ${ksi.ksi_id} has ${commandCount} validation commands`);
                                onNotification(`${ksi.ksi_id} has ${commandCount} automated validation commands`, 'info');
                              }}
                              className="text-gray-600 hover:text-gray-900"
                              title="View Commands"
                            >
                              <Settings size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg font-medium">Loading KSI Management...</div>
          <div className="text-sm text-gray-500">Reading from DynamoDB tables...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">KSI Management Portal</h1>
            <p className="text-gray-600 mt-2">
              Configure Key Security Indicators using real DynamoDB data
            </p>
          </div>
          
          {/* Tenant Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-700">Current Tenant:</div>
            <div className="text-lg font-bold text-gray-900">{tenantData?.organization?.name || selectedTenant}</div>
            <div className="text-sm text-gray-500">{tenantData?.enabled_ksis?.length || 0} KSIs enabled</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <BarChart3 size={16} />
              <span>Overview</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('configuration')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'configuration'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Settings size={16} />
              <span>Configuration ({getKSIStats().enabled} enabled)</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'configuration' && renderConfigurationTab()}
    </div>
  );
};

export default RealKSIManagement;
