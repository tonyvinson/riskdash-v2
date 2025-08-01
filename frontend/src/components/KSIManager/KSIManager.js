import React, { useState, useEffect } from 'react';

// 🎯 Enhanced KSI Manager with Real CLI Integration
const EnhancedKSIManager = ({ initialMode = 'interactive', showTitle = true, data = null }) => {
  const [ksiData, setKsiData] = useState({
    automated: [],
    manual: [],
    failed: [],
    loading: true
  });
  
  const [selectedCategory, setSelectedCategory] = useState('automated');
  const [loading, setLoading] = useState(true);
  const [runningValidation, setRunningValidation] = useState(false);
  const [lastValidation, setLastValidation] = useState(null);

  useEffect(() => {
    if (data) {
      // Use provided data from parent component
      processKSIData(data);
    } else {
      // Load data independently
      loadKSIData();
    }
  }, [data]);

  const loadKSIData = async () => {
    try {
      setLoading(true);
      
      const apiClient = {
        get: async (path) => {
          const response = await fetch(`https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev${path}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        }
      };

      // Fetch all data needed for KSI management
      const [resultsResponse, ksisResponse, executionsResponse] = await Promise.all([
        apiClient.get('/api/ksi/results?tenant_id=tenant-0bf4618d'),
        apiClient.get('/api/admin/ksi-defaults'),
        apiClient.get('/api/ksi/executions?tenant_id=tenant-0bf4618d&limit=5')
      ]);

      const data = {
        results: resultsResponse.results || [],
        available_ksis: ksisResponse.available_ksis || [],
        executions: executionsResponse.executions || []
      };

      processKSIData(data);
      
    } catch (error) {
      console.error('❌ Error loading KSI data:', error);
      setLoading(false);
    }
  };

  const processKSIData = (data) => {
    try {
      const results = data.results || [];
      const allKSIs = data.available_ksis || [];
      const executions = data.executions || data.executionHistory || [];

      // Get the latest execution for reference
      const latestExecution = executions[0];
      setLastValidation(latestExecution);

      // Categorize KSIs based on real execution data
      const automated = [];
      const manual = [];
      const failed = [];

      allKSIs.forEach(ksi => {
        const result = results.find(r => r.ksi_id === ksi.ksi_id);
        const commandsExecuted = parseInt(result?.commands_executed || 0);
        const hasRealCommands = commandsExecuted > 0 && result?.cli_command_details?.length > 0;
        
        const ksiWithStatus = {
          ...ksi,
          ...result,
          commands_executed: commandsExecuted,
          has_real_cli: hasRealCommands,
          automation_type: ksi.automation_type || (hasRealCommands ? 'fully_automated' : 'manual'),
          last_run: result?.timestamp,
          status: result?.assertion
        };

        // Categorize based on automation capability and results
        if (hasRealCommands || ksi.automation_type === 'fully_automated') {
          if (result?.assertion === false) {
            failed.push(ksiWithStatus);
          } else {
            automated.push(ksiWithStatus);
          }
        } else {
          manual.push(ksiWithStatus);
        }
      });

      // Sort by execution status and command count
      automated.sort((a, b) => (b.commands_executed || 0) - (a.commands_executed || 0));
      failed.sort((a, b) => (b.commands_executed || 0) - (a.commands_executed || 0));

      setKsiData({
        automated,
        manual,
        failed,
        loading: false,
        totalKSIs: allKSIs.length,
        automatedCount: automated.length,
        manualCount: manual.length,
        failedCount: failed.length
      });
      
      setLoading(false);
      
    } catch (error) {
      console.error('❌ Error processing KSI data:', error);
      setLoading(false);
    }
  };

  // 🚀 Run validation for specific KSI categories
  const runValidation = async (ksiList = null, category = 'automated') => {
    try {
      setRunningValidation(true);
      
      let ksiFilter;
      if (ksiList) {
        ksiFilter = ksiList;
      } else if (category === 'automated') {
        ksiFilter = ksiData.automated
          .filter(ksi => ksi.automation_type === 'fully_automated')
          .slice(0, 5) // Limit to top 5 for demo
          .map(ksi => ksi.ksi_id);
      } else if (category === 'failed') {
        ksiFilter = ksiData.failed.map(ksi => ksi.ksi_id);
      }

      console.log('🚀 Running validation for:', ksiFilter);

      const response = await fetch('https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev/api/ksi/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'tenant-0bf4618d',
          ksi_filter: ksiFilter
        })
      });

      const result = await response.json();
      console.log('✅ Validation started:', result);

      // Refresh data after a short delay
      setTimeout(() => {
        if (data) {
          // If using parent data, trigger parent refresh
          window.location.reload();
        } else {
          loadKSIData();
        }
      }, 3000);

    } catch (error) {
      console.error('❌ Validation failed:', error);
    } finally {
      setRunningValidation(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {showTitle && (
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">KSI Automation Manager</h2>
              <p className="text-sm text-gray-600">
                Manage and execute FedRAMP 20X compliance validations
              </p>
            </div>
            {lastValidation && (
              <div className="text-right">
                <p className="text-sm text-gray-600">Last run</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(lastValidation.timestamp).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{ksiData.automatedCount}</div>
            <div className="text-sm text-gray-600">Automated</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{ksiData.failedCount}</div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{ksiData.manualCount}</div>
            <div className="text-sm text-gray-600">Manual</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex space-x-3 mb-6">
          <button
            onClick={() => runValidation(null, 'automated')}
            disabled={runningValidation || ksiData.automatedCount === 0}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              runningValidation || ksiData.automatedCount === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {runningValidation ? '🔄 Running...' : '🚀 Run All Automated'}
          </button>
          
          <button
            onClick={() => runValidation(null, 'failed')}
            disabled={runningValidation || ksiData.failedCount === 0}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              runningValidation || ksiData.failedCount === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            🔄 Retry Failed
          </button>
        </div>

        {/* Category Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex">
            {[
              { key: 'automated', label: '🤖 Automated', count: ksiData.automatedCount },
              { key: 'failed', label: '❌ Failed', count: ksiData.failedCount },
              { key: 'manual', label: '📝 Manual', count: ksiData.manualCount }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSelectedCategory(tab.key)}
                className={`py-2 px-4 border-b-2 font-medium text-sm ${
                  selectedCategory === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </nav>
        </div>

        {/* KSI Lists */}
        <div className="space-y-3">
          {ksiData[selectedCategory]?.map((ksi) => (
            <div
              key={ksi.ksi_id}
              className={`p-4 border rounded-lg transition-all ${
                ksi.status === true 
                  ? 'border-green-200 bg-green-50'
                  : ksi.status === false
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">
                      {ksi.status === true ? '✅' : ksi.status === false ? '❌' : '⏳'}
                    </span>
                    <div>
                      <h4 className="font-medium text-gray-900">{ksi.ksi_id}</h4>
                      <p className="text-sm text-gray-600">{ksi.title}</p>
                    </div>
                  </div>
                  
                  <div className="mt-2 flex items-center space-x-4">
                    {/* Automation Type Badge */}
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      ksi.automation_type === 'fully_automated'
                        ? 'bg-green-100 text-green-800'
                        : ksi.automation_type === 'partially_automated'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {ksi.automation_type?.replace('_', ' ') || 'manual'}
                    </span>

                    {/* CLI Commands Info */}
                    {ksi.commands_executed > 0 && (
                      <span className="text-sm text-blue-600 font-medium">
                        📋 {ksi.commands_executed} CLI commands
                      </span>
                    )}

                    {/* Real CLI Validation Badge */}
                    {ksi.has_real_cli && (
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        🔧 Real AWS validation
                      </span>
                    )}

                    {/* Last Run */}
                    {ksi.last_run && (
                      <span className="text-xs text-gray-500">
                        Last run: {new Date(ksi.last_run).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Individual Run Button */}
                  {(ksi.automation_type === 'fully_automated' || ksi.has_real_cli) && (
                    <button
                      onClick={() => runValidation([ksi.ksi_id])}
                      disabled={runningValidation}
                      className={`px-3 py-1 text-sm rounded transition-colors ${
                        runningValidation
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      }`}
                    >
                      {runningValidation ? '⏳' : '▶️'}
                    </button>
                  )}

                  {/* Status */}
                  <div className="text-right">
                    <span className={`text-sm font-medium ${
                      ksi.status === true 
                        ? 'text-green-600' 
                        : ksi.status === false 
                        ? 'text-red-600' 
                        : 'text-gray-600'
                    }`}>
                      {ksi.status === true ? 'PASSED' : ksi.status === false ? 'FAILED' : 'PENDING'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Show assertion reason for failed KSIs */}
              {ksi.status === false && ksi.assertion_reason && (
                <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded text-sm text-red-800">
                  <strong>Failure reason:</strong> {ksi.assertion_reason}
                </div>
              )}
            </div>
          ))}

          {ksiData[selectedCategory]?.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No {selectedCategory} KSIs found</p>
              {selectedCategory === 'automated' && (
                <p className="text-sm mt-1">
                  KSIs with CLI commands will appear here once validation runs
                </p>
              )}
            </div>
          )}
        </div>

        {/* Running Validation Indicator */}
        {runningValidation && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <div>
                <p className="font-medium text-blue-900">Validation in progress...</p>
                <p className="text-sm text-blue-700">
                  Executing AWS CLI commands and collecting compliance evidence
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedKSIManager;
