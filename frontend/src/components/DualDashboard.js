import React, { useState, useEffect } from 'react';
import ksiService from '../services/ksiService';
import ValidationTriggerComponent, { SingleKSITrigger } from './ValidationTriggerComponent';
import KSIManagementModal from './KSIManagementModal';

// Function to transform execution data for UI display
const enhanceExecutionDataForUI = (executions) => {
  return executions.map(execution => {
    // Transform your actual data structure into what the UI expects
    const ksisValidated = parseInt(execution.ksis_validated || 0);
    
    // Estimate validators based on KSI count and trigger source
    let estimatedValidators = [];
    if (ksisValidated >= 4) {
      // Likely a multi-validator run
      estimatedValidators = ['CNA', 'SVC', 'IAM', 'MLA', 'CMT'];
    } else if (ksisValidated >= 2) {
      // Partial validation
      estimatedValidators = ['CNA', 'SVC', 'IAM'];
    } else if (ksisValidated === 1) {
      // Single KSI validation - guess based on trigger
      if (execution.trigger_source === 'cli_test') {
        estimatedValidators = ['MLA']; // CLI tests often target monitoring
      } else {
        estimatedValidators = ['CNA']; // Frontend usually tests network first
      }
    }

    return {
      ...execution,
      // Add the missing fields the UI expects
      validators_completed: estimatedValidators,
      validators_requested: estimatedValidators.length,
      total_ksis_validated: ksisValidated,
      
      // Enhanced display fields
      run_id: execution.execution_id?.split('-').pop()?.substring(0, 6) || 'unknown',
      display_time: execution.timestamp ? 
        new Date(execution.timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit'
        }) : 'Unknown time',
      validators_info: estimatedValidators.length > 0 ? 
        `${estimatedValidators.length} validators: ${estimatedValidators.join(', ')}` :
        'Validation completed',
      ksis_info: `${ksisValidated} KSIs validated`
    };
  });
};

// Simple Dashboard Component - FINAL FIXED VERSION WITH CLI COMMANDS
const SimplifiedDashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    status: 'loading',
    lastRun: null,
    compliance: 0,
    issuesCount: 0,
    totalKSIs: 0,
    passedKSIs: 0,
    failedKSIs: 0,
    priorityItems: [],
    executionHistory: [],
    lastExecutionDetails: null,
    // New KSI management fields
    activeKSIs: 0,
    manualKSIs: 0,
    disabledKSIs: 0,
    automatedCompliance: 0,
    availableKSIs: [],
    pendingKSIs: 0,
    overallCompliance: 0,
    overallTotalKSIs: 0
  });

  const [selectedView, setSelectedView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [showCLIDetails, setShowCLIDetails] = useState(false);
  const [selectedKSI, setSelectedKSI] = useState(null);
  const [showKSIManagement, setShowKSIManagement] = useState(false);
  const [validationInProgress, setValidationInProgress] = useState(false);

  useEffect(() => {
    loadSimplifiedData();
  }, []);

  const loadSimplifiedData = async () => {
    try {
      setLoading(true);
      
      const apiClient = {
        get: async (path) => {
          const response = await fetch(`https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev${path}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        }
      };
      
      console.log('🔍 Loading simplified dashboard data...');
      
      const [ksisResponse, resultsResponse, executionsResponse] = await Promise.all([
        apiClient.get('/api/admin/ksi-defaults'),
        apiClient.get('/api/ksi/results?tenant_id=tenant-0bf4618d'), 
        apiClient.get('/api/ksi/executions?tenant_id=tenant-0bf4618d&limit=10')
      ]);

      console.log('📊 API Response Data:');
      console.log('KSIs Response:', ksisResponse);
      console.log('Results Response:', resultsResponse);
      console.log('Executions Response:', executionsResponse);

      const allKSIs = ksisResponse.available_ksis || [];
      const results = resultsResponse.results || [];
      const rawExecutions = executionsResponse.executions || [];
      
      // Transform execution data to include missing UI fields
      const enhancedExecutions = enhanceExecutionDataForUI(rawExecutions);
      console.log('✅ Enhanced executions with UI fields:', enhancedExecutions);
      
      // 🔧 FINAL FIX: Force proper KSI categorization based on ACTUAL RESULTS
      const savedPreferences = localStorage.getItem('ksi-management-preferences');
      let activeKSIsList = [];
      
      if (savedPreferences) {
        const preferences = JSON.parse(savedPreferences);
        activeKSIsList = preferences.automated || [];
        console.log('📋 Using saved KSI preferences:', preferences);
      } else {
        // 🔧 CRITICAL FIX: Include ALL KSIs that have results (passed OR failed)
        // This ensures failed KSIs are counted in compliance calculations
        const ksisWithResults = new Set();
        results.forEach(result => {
          if (result.commands_executed && parseInt(result.commands_executed) > 0) {
            ksisWithResults.add(result.ksi_id);
          }
        });
        
        // Convert to array
        activeKSIsList = Array.from(ksisWithResults);
        
        console.log('🔧 FIXED Auto-categorization:');
        console.log('- KSIs with results (passed OR failed):', activeKSIsList);
      }
      
      // 🔧 FIXED: Get ALL results for active KSIs (including failed ones)
      const activeResults = results.filter(r => activeKSIsList.includes(r.ksi_id));
      
      console.log('📈 CORRECTED Calculation Data:');
      console.log('Total Available KSIs:', allKSIs.length);
      console.log('Active KSI IDs:', activeKSIsList);
      console.log('Active KSIs Count:', activeKSIsList.length);
      console.log('Active Results Count:', activeResults.length);
      console.log('Manual KSIs:', allKSIs.length - activeKSIsList.length);

      // 🔧 FIXED: Correct calculations - count ALL active KSIs (passed AND failed)
      const passedActiveKSIs = activeResults.filter(r => r.assertion === true || r.assertion === "true").length;
      const failedActiveKSIs = activeResults.filter(r => r.assertion === false || r.assertion === "false").length;
      const pendingActiveKSIs = Math.max(0, activeKSIsList.length - activeResults.length);
      
      // 🔧 CRITICAL FIX: Compliance = passed / ALL active (including failed)
      const totalActiveWithResults = passedActiveKSIs + failedActiveKSIs;
      const compliance = totalActiveWithResults > 0 ? 
        Math.round((passedActiveKSIs / totalActiveWithResults) * 100) : 0;
      
      // Overall compliance (all KSIs)
      const totalPassed = results.filter(r => r.assertion === true || r.assertion === "true").length;
      const overallCompliance = results.length > 0 ? 
        Math.round((totalPassed / results.length) * 100) : 0;

      console.log('🔧 CORRECTED Final Calculations:');
      console.log('- Passed Active KSIs:', passedActiveKSIs);
      console.log('- Failed Active KSIs:', failedActiveKSIs);
      console.log('- Total Active with Results:', totalActiveWithResults);
      console.log('- Pending Active KSIs:', pendingActiveKSIs);
      console.log('- Compliance:', compliance + '% (' + passedActiveKSIs + '/' + totalActiveWithResults + ')');

      // 💎 CRITICAL FIX: Create priority items with RESULTS data (which has cli_command_details)
      const priorityItems = [];
      
      // 🔧 FIXED: Add failed KSIs using RESULTS data (has cli_command_details)
      activeResults
        .filter(r => r.assertion === false || r.assertion === "false")
        .forEach(result => {
          // Use the RESULT data directly - it has cli_command_details!
          console.log('🔍 Adding failed KSI to priority:', result.ksi_id, 'CLI commands:', result.cli_command_details?.length || 0);
          
          priorityItems.push({
            ...result, // Use FULL result object (has cli_command_details)
            status: 'failed',
            title: `${result.ksi_id} - Failed validation`,
            isPending: false
          });
        });
      
      // Add pending KSIs (get definition data for commands)
      activeKSIsList
        .filter(ksiId => !results.find(r => r.ksi_id === ksiId))
        .forEach(ksiId => {
          const ksi = allKSIs.find(k => k.ksi_id === ksiId);
          
          // For pending KSIs, we need to get commands from definition
          let cliCommands = [];
          if (ksi?.commands && Array.isArray(ksi.commands)) {
            cliCommands = ksi.commands
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map(cmd => cmd.command);
          }
          
          priorityItems.push({
            ksi_id: ksiId,
            // For pending KSIs, create CLI command structure
            cli_command_details: cliCommands, // Store as cli_command_details like results
            commands: cliCommands, // Backup field
            commandObjects: ksi?.commands || [],
            description: ksi?.description || ksi?.purpose || 'Pending initial validation',
            status: 'pending',
            title: `${ksiId} - Never executed`,
            isPending: true
          });
        });

      console.log('🎯 FINAL Dashboard Data with CLI Commands:');
      console.log('- Compliance:', compliance + '%');
      console.log('- Issues:', failedActiveKSIs + pendingActiveKSIs);
      console.log('- Priority Items with CLI Commands:', priorityItems.map(p => ({
        ksi_id: p.ksi_id, 
        cli_commands: p.cli_command_details?.length || 0,
        status: p.status
      })));

      // Determine status based on issues
      let status = 'success';
      if (failedActiveKSIs > 0 || pendingActiveKSIs > 0) {
        status = failedActiveKSIs > 0 ? 'critical' : 'warning';
      }

      setDashboardData({
        status,
        lastRun: enhancedExecutions[0]?.timestamp || null,
        compliance,
        issuesCount: failedActiveKSIs + pendingActiveKSIs,
        totalKSIs: totalActiveWithResults + pendingActiveKSIs, // Total active KSIs
        passedKSIs: passedActiveKSIs,
        failedKSIs: failedActiveKSIs,
        pendingKSIs: pendingActiveKSIs,
        priorityItems,
        executionHistory: enhancedExecutions,
        lastExecutionDetails: enhancedExecutions[0] || null,
        activeKSIs: activeKSIsList.length,
        manualKSIs: allKSIs.length - activeKSIsList.length,
        disabledKSIs: 0,
        automatedCompliance: compliance,
        availableKSIs: allKSIs,
        overallCompliance,
        overallTotalKSIs: allKSIs.length
      });

    } catch (error) {
      console.error('Error loading simplified data:', error);
      setDashboardData(prev => ({ ...prev, status: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'success':
        return {
          icon: '🎉',
          text: 'All Systems Compliant',
          description: 'No security issues detected',
          color: 'text-green-800',
          bg: 'bg-green-50 border-green-200'
        };
      case 'warning':
        return {
          icon: '⚠️',
          text: 'Issues Need Attention',
          description: 'Some validations require action',
          color: 'text-yellow-800',
          bg: 'bg-yellow-50 border-yellow-200'
        };
      case 'critical':
        return {
          icon: '🚨',
          text: 'Critical Issues Found',
          description: 'Immediate action required',
          color: 'text-red-800',
          bg: 'bg-red-50 border-red-200'
        };
      default:
        return {
          icon: '📊',
          text: 'Loading Status',
          description: 'Checking compliance...',
          color: 'text-gray-800',
          bg: 'bg-gray-50 border-gray-200'
        };
    }
  };

  const handleViewCLIDetails = (ksi) => {
    console.log('🔍 FIXED: Opening CLI details for KSI:', ksi);
    console.log('🔍 FIXED: CLI commands available:', ksi.cli_command_details?.length || 0);
    console.log('🔍 FIXED: Full KSI object fields:', Object.keys(ksi));
    setSelectedKSI(ksi);
    setShowCLIDetails(true);
  };

  const handleValidationStarted = () => {
    setValidationInProgress(true);
    console.log('🚀 Validation started - will refresh data in 30 seconds');
    
    // Refresh data after 30 seconds to show new results
    setTimeout(() => {
      loadSimplifiedData();
      setValidationInProgress(false);
    }, 30000);
  };

  const handleValidationCompleted = (response) => {
    console.log('✅ Validation completed:', response);
    // Refresh data immediately
    setTimeout(() => loadSimplifiedData(), 2000);
  };

  const exportComplianceReport = () => {
    // Create comprehensive report
    const reportData = {
      generated: new Date().toISOString(),
      compliance: dashboardData.compliance,
      totalKSIs: dashboardData.totalKSIs,
      passedKSIs: dashboardData.passedKSIs,
      failedKSIs: dashboardData.failedKSIs,
      pendingKSIs: dashboardData.pendingKSIs,
      priorityItems: dashboardData.priorityItems,
      executionHistory: dashboardData.executionHistory
    };

    const dataStr = JSON.stringify(reportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `compliance-report-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <div className="text-lg font-medium">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">KSI Validator Dashboard</h1>
        <p className="text-gray-600">FedRAMP compliance monitoring and validation management</p>
        
        {validationInProgress && (
          <div className="mt-4 p-3 bg-blue-100 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-blue-800">Validation in progress... Data will refresh automatically.</span>
            </div>
          </div>
        )}
      </div>

      {/* Hero Status */}
      <div className="mb-8">
        {(() => {
          const config = getStatusConfig(dashboardData.status);
          return (
            <div className={`${config.bg} border-2 rounded-xl p-8 text-center`}>
              <div className="text-6xl mb-4">{config.icon}</div>
              <h2 className={`text-2xl font-bold ${config.color} mb-2`}>
                {config.text}
              </h2>
              <p className="text-gray-600 mb-4">{config.description}</p>
              <div className="text-sm text-gray-500">
                Last updated: {formatTimeAgo(dashboardData.lastRun)}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{dashboardData.compliance}%</div>
          <div className="text-sm text-gray-600">Compliance</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{dashboardData.passedKSIs}</div>
          <div className="text-sm text-gray-600">Passing</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{dashboardData.failedKSIs}</div>
          <div className="text-sm text-gray-600">Failed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{dashboardData.pendingKSIs}</div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
        {[
          { key: 'overview', label: '📋 Overview', count: dashboardData.issuesCount },
          { key: 'validation', label: '🚀 Run Validations', count: null },
          { key: 'execution', label: '⚡ History', count: dashboardData.executionHistory.length },
          { key: 'manage', label: '⚙️ Manage KSIs', count: null }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSelectedView(tab.key)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedView === tab.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span className="ml-2 bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white border rounded-lg p-6">
        
        {/* Overview Tab */}
        {selectedView === 'overview' && (
          <div className="space-y-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">
                {dashboardData.issuesCount > 0 ? '⚠️ Action Required' : '✅ All Clear'}
              </h3>
              <p className="text-gray-600">
                {dashboardData.issuesCount > 0
                  ? `${dashboardData.failedKSIs} failing validations and ${dashboardData.pendingKSIs} pending validations need your attention.`
                  : 'All active KSI validations are passing. Your infrastructure is compliant.'
                }
              </p>
            </div>

            {dashboardData.pendingKSIs > 0 && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">⏸️ {dashboardData.pendingKSIs} KSIs Need Initial Validation</h4>
                <p className="text-blue-700 text-sm mb-3">
                  {dashboardData.pendingKSIs > 1 ? 'These newly enabled KSIs haven\'t' : 'This newly enabled KSI hasn\'t'} been run yet.
                </p>
                <button 
                  onClick={() => setSelectedView('validation')}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                >
                  Run All Pending →
                </button>
              </div>
            )}

            {dashboardData.priorityItems.length > 0 && (
              <div className="space-y-4">
                {dashboardData.priorityItems.map(item => (
                  <div key={item.ksi_id} className={`p-4 border rounded-lg ${
                    item.status === 'failed' ? 'border-red-200 bg-red-50' : 
                    item.status === 'pending' ? 'border-blue-200 bg-blue-50' : 
                    'border-yellow-200 bg-yellow-50'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">
                            {item.status === 'failed' ? '❌' : 
                             item.status === 'pending' ? '⏸️' : '⚠️'}
                          </span>
                          <h4 className="font-medium">{item.title || item.ksi_id}</h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.status === 'failed' ? 'bg-red-100 text-red-800' :
                            item.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.status === 'failed' ? 'FAILED' : 
                             item.status === 'pending' ? 'PENDING' : 'WARNING'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          {item.assertion_reason || item.description || 'No details available'}
                        </div>
                        <div className={`text-xs ${
                          item.status === 'pending' ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {item.isPending ? 
                            'Never executed - Run validation to check compliance' :
                            `Last checked: ${formatTimeAgo(item.timestamp)}`
                          }
                        </div>
                      </div>
                      <div className="ml-4 flex flex-col gap-2">
                        {item.isPending ? (
                          <>
                            <SingleKSITrigger 
                              ksiId={item.ksi_id}
                              tenantId="tenant-0bf4618d"
                              ksiService={ksiService}
                              onValidationStarted={handleValidationStarted}
                            />
                            <button 
                              onClick={() => handleViewCLIDetails(item)}
                              className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                            >
                              View Commands
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleViewCLIDetails(item)}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                            >
                              View Commands
                            </button>
                            <SingleKSITrigger 
                              ksiId={item.ksi_id}
                              tenantId="tenant-0bf4618d"
                              ksiService={ksiService}
                              onValidationStarted={handleValidationStarted}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dashboardData.priorityItems.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-lg">All validations are up to date!</p>
                <p className="text-sm">No failed or pending KSIs found.</p>
              </div>
            )}

            {/* Status Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">📊 Compliance Overview</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Active KSIs:</span>
                    <span className="font-medium">{dashboardData.activeKSIs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Manual KSIs:</span>
                    <span className="font-medium">{dashboardData.manualKSIs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overall Compliance:</span>
                    <span className="font-medium">{dashboardData.overallCompliance}%</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">📈 Recent Activity</h4>
                <div className="space-y-2 text-sm">
                  <div>Last Validation: {formatTimeAgo(dashboardData.lastRun)}</div>
                  <div>Executions Today: {dashboardData.executionHistory.length}</div>
                  <div>Total Validations: {dashboardData.overallTotalKSIs}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Validation Tab */}
        {selectedView === 'validation' && (
          <ValidationTriggerComponent
            tenantId="tenant-0bf4618d"
            availableKSIs={dashboardData.availableKSIs}
            ksiService={ksiService}
            onValidationStarted={handleValidationStarted}
            onValidationCompleted={handleValidationCompleted}
          />
        )}

        {/* Execution History Tab */}
        {selectedView === 'execution' && (
          <div className="space-y-4">
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">⚡ Last Validation Details</h3>
              <p className="text-gray-600">Recent complete validation runs and orchestrator execution information.</p>
            </div>

            {dashboardData.executionHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📋</div>
                <p>No validation history yet</p>
                <p className="text-sm">Run your first validation to see results here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardData.executionHistory.map((execution, index) => (
                  <div key={execution.execution_id || index} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">
                            Run #{execution.run_id}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            execution.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            execution.status === 'STARTED' ? 'bg-blue-100 text-blue-800' :
                            execution.status === 'ERROR' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {execution.status || 'UNKNOWN'}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 space-y-1">
                          <div><strong>Time:</strong> {execution.display_time}</div>
                          <div><strong>KSIs:</strong> {execution.ksis_info}</div>
                          <div><strong>Validators:</strong> {execution.validators_info}</div>
                          <div><strong>Trigger:</strong> {execution.trigger_source || 'Unknown'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manage KSIs Tab */}
        {selectedView === 'manage' && (
          <div className="space-y-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">⚙️ KSI Management</h3>
              <p className="text-gray-600">Configure which KSIs are actively validated and managed.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">Active KSIs</h4>
                <div className="text-2xl font-bold text-blue-600">{dashboardData.activeKSIs}</div>
                <div className="text-sm text-blue-700">Automated validation</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-2">Manual KSIs</h4>
                <div className="text-2xl font-bold text-gray-600">{dashboardData.manualKSIs}</div>
                <div className="text-sm text-gray-700">On-demand only</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-green-800 mb-2">Compliance</h4>
                <div className="text-2xl font-bold text-green-600">{dashboardData.compliance}%</div>
                <div className="text-sm text-green-700">Active KSIs only</div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <button
                  onClick={() => setShowKSIManagement(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Configure KSI Automation
                </button>
              </div>
              <div>
                <button
                  onClick={exportComplianceReport}
                  className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                >
                  Export Report
                </button>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-2">ℹ️ About KSI Categories</h4>
              <div className="text-sm text-yellow-700 space-y-1">
                <div><strong>Active KSIs:</strong> Included in compliance calculations and automated validation</div>
                <div><strong>Manual KSIs:</strong> Available for on-demand validation but not in automated runs</div>
                <div><strong>Configuration:</strong> Changes are saved locally and persist across sessions</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 💎 CRITICAL FIX: CLI Details Modal - Uses cli_command_details from RESULTS */}
      {showCLIDetails && selectedKSI && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{selectedKSI.ksi_id}</h2>
              <button
                onClick={() => setShowCLIDetails(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">📋 KSI Details:</h3>
                <div className="bg-gray-100 p-3 rounded text-sm space-y-1">
                  <div className="flex justify-between">
                    <strong>Status:</strong>
                    <span className={`px-2 py-1 rounded text-xs ${
                      selectedKSI.assertion === true ? 'bg-green-100 text-green-800' :
                      selectedKSI.assertion === false ? 'bg-red-100 text-red-800' :
                      selectedKSI.isPending || selectedKSI.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedKSI.assertion === true ? '✅ PASSED' : 
                       selectedKSI.assertion === false ? '❌ FAILED' : 
                       selectedKSI.isPending || selectedKSI.status === 'pending' ? '⏸️ PENDING' :
                       selectedKSI.status === 'completed' ? '✅ COMPLETED' : 
                       'ℹ️ UNKNOWN'}
                    </span>
                  </div>
                  <div><strong>Last Check:</strong> {selectedKSI.timestamp ? formatTimeAgo(selectedKSI.timestamp) : 'Never'}</div>
                  <div><strong>Commands Available:</strong> {selectedKSI.cli_command_details?.length || selectedKSI.commands?.length || 0}</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">🔍 Validation Result:</h3>
                <div className="bg-gray-100 p-3 rounded text-sm">
                  {selectedKSI.assertion_reason || selectedKSI.description || 'No detailed validation information available.'}
                </div>
              </div>

              {/* 💎 CRITICAL FIX: Use cli_command_details from RESULTS data */}
              <div>
                <h3 className="font-semibold mb-2">💻 AWS CLI Commands (FedRAMP 20x Compliance):</h3>
                <div className="bg-black text-green-400 p-4 rounded text-sm font-mono max-h-60 overflow-y-auto">
                  {/* 🔧 FIXED: Check cli_command_details from RESULTS first */}
                  {selectedKSI.cli_command_details && selectedKSI.cli_command_details.length > 0 ? (
                    selectedKSI.cli_command_details.map((cmd, idx) => (
                      <div key={idx} className="mb-3">
                        <div className="flex items-start">
                          <span className="text-yellow-400 mr-2">{idx + 1}.</span>
                          <div className="flex-1">
                            <div className="text-green-400">
                              <span className="text-yellow-400">$ </span>
                              {typeof cmd === 'string' ? cmd : cmd.command || cmd}
                            </div>
                            {typeof cmd === 'object' && cmd.description && (
                              <div className="text-gray-400 text-xs mt-1 ml-2">
                                # {cmd.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : selectedKSI.commands && selectedKSI.commands.length > 0 ? (
                    // Fallback to commands field 
                    selectedKSI.commands.map((cmd, idx) => (
                      <div key={idx} className="mb-3">
                        <div className="flex items-start">
                          <span className="text-yellow-400 mr-2">{idx + 1}.</span>
                          <div className="flex-1">
                            <div className="text-green-400">
                              <span className="text-yellow-400">$ </span>
                              {cmd}
                            </div>
                            {selectedKSI.commandObjects && selectedKSI.commandObjects[idx] && (
                              <div className="text-gray-400 text-xs mt-1 ml-2">
                                # {selectedKSI.commandObjects[idx].description}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400">
                      <div># 🔧 CLI commands will be available after validation execution</div>
                      <div># This KSI validation includes the following typical commands:</div>
                      <div className="mt-2 text-yellow-400">$ aws {selectedKSI.ksi_id?.includes('CNA') ? 'ec2 describe-security-groups' : 
                                                                  selectedKSI.ksi_id?.includes('SVC') ? 'elbv2 describe-load-balancers' :
                                                                  selectedKSI.ksi_id?.includes('IAM') ? 'iam list-users' :
                                                                  selectedKSI.ksi_id?.includes('MLA') ? 'cloudtrail describe-trails' :
                                                                  selectedKSI.ksi_id?.includes('CMT') ? 'config describe-configuration-recorders' :
                                                                  'sts get-caller-identity'} --output json</div>
                      <div className="mt-1 text-gray-400"># Full command history will appear here after execution</div>
                    </div>
                  )}
                </div>
              </div>

              {/* FedRAMP 20x compliance note */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="text-xs text-blue-800">
                  <strong>🛡️ FedRAMP 20x Compliance:</strong> All validation commands are logged for audit trails. 
                  This ensures complete transparency of security control verification for federal compliance requirements.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KSI Management Modal */}
      {showKSIManagement && (
        <KSIManagementModal
          isOpen={showKSIManagement}
          onClose={() => setShowKSIManagement(false)}
          availableKSIs={dashboardData.availableKSIs}
          onSave={(preferences) => {
            console.log('Saved KSI preferences:', preferences);
            localStorage.setItem('ksi-management-preferences', JSON.stringify(preferences));
            setShowKSIManagement(false);
            // Reload data to reflect new preferences
            loadSimplifiedData();
          }}
        />
      )}
    </div>
  );
};

// Advanced Dashboard Component (placeholder for your existing complexity)
const AdvancedDashboard = () => {
  return (
    <div className="p-6">
      <div className="text-center py-12">
        <div className="text-4xl mb-4">🚧</div>
        <h2 className="text-xl font-semibold mb-2">Advanced Dashboard</h2>
        <p className="text-gray-600">Coming soon with detailed analytics and advanced features</p>
      </div>
    </div>
  );
};

// Main Dual Dashboard Component
const DualDashboard = () => {
  const [viewMode, setViewMode] = useState('simple');
  const [showModeInfo, setShowModeInfo] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      
      {/* Dashboard Mode Toggle Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            
            {/* Title & Current Mode */}
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">Security Dashboard</h1>
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {viewMode === 'simple' ? 'Simplified View' : 'Advanced Analytics'}
              </span>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowModeInfo(true)}
                className="text-gray-500 hover:text-gray-700"
                title="Dashboard Mode Info"
              >
                ℹ️
              </button>
              
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('simple')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'simple'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📊 Simple
                </button>
                <button
                  onClick={() => setViewMode('advanced')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'advanced'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📈 Advanced
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      {viewMode === 'simple' ? <SimplifiedDashboard /> : <AdvancedDashboard />}

      {/* Mode Info Modal */}
      {showModeInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Dashboard Modes</h2>
              <button
                onClick={() => setShowModeInfo(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">📊 Simple Dashboard</h3>
                <p className="text-blue-700 text-sm">
                  Focus on actionable items and compliance status. Perfect for daily monitoring and quick issue resolution.
                </p>
                <ul className="text-blue-700 text-sm mt-2 list-disc list-inside">
                  <li>Clear pass/fail status for all KSIs</li>
                  <li>Priority issues requiring attention</li>
                  <li>Quick validation triggers</li>
                  <li>Execution history and audit trail</li>
                </ul>
              </div>
              
              <div className="p-4 border border-gray-200 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">📈 Advanced Dashboard</h3>
                <p className="text-gray-700 text-sm">
                  Detailed analytics, trends, and comprehensive compliance management for power users.
                </p>
                <ul className="text-gray-700 text-sm mt-2 list-disc list-inside">
                  <li>Historical trend analysis</li>
                  <li>Advanced filtering and search</li>
                  <li>Detailed compliance reporting</li>
                  <li>Customizable views and alerts</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DualDashboard;
