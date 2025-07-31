import React, { useState, useEffect } from 'react';
import KSIManager from './KSIManager/KSIManager';
import KSIManagementModal from './KSIManagementModal';

// Simple Dashboard Component - WITH KSI Management
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
    automatedCompliance: 0
  });

  const [selectedView, setSelectedView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [showCLIDetails, setShowCLIDetails] = useState(false);
  const [selectedKSI, setSelectedKSI] = useState(null);
  const [showKSIManagement, setShowKSIManagement] = useState(false);

  // 🚨 TEMPORARY HARDCODED LIST - NEEDS DATABASE FLAG
  // TODO: Replace with dynamic query for KSIs where automation_enabled = true
  const CLI_ENABLED_KSIS = [
    'KSI-CNA-07', 'KSI-MLA-01', 'KSI-MLA-02', 'KSI-MLA-03', 
    'KSI-CMT-03', 'KSI-IAM-03', 'KSI-PIY-07', 'KSI-CNA-01',
    'KSI-CNA-02', 'KSI-CNA-03', 'KSI-CNA-04', 'KSI-CNA-05',
    'KSI-IAM-01', 'KSI-IAM-02', 'KSI-CMT-01', 'KSI-CMT-02'
  ];

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
      
      // Get real data from your existing endpoints
      console.log('🔍 Loading simplified dashboard data...');
      
      const [ksisResponse, resultsResponse, executionsResponse] = await Promise.all([
        apiClient.get('/api/admin/ksi-defaults').catch(e => {
          console.log('KSI defaults failed, trying alternative:', e);
          return apiClient.get('/api/admin/tenants').then(r => ({ ksis: [] })); // Fallback
        }),
        apiClient.get('/api/ksi/results?tenant_id=tenant-0bf4618d').catch(e => {
          console.log('Results API failed:', e);
          return { results: [] };
        }),
        apiClient.get('/api/ksi/executions?tenant_id=tenant-0bf4618d&limit=5').catch(e => {
          console.log('Executions API failed, trying orchestrator endpoint:', e);
          // Try orchestrator endpoint for complete validation runs
          return apiClient.get('/api/orchestrator/executions?tenant_id=tenant-0bf4618d&limit=5').catch(e2 => {
            console.log('Orchestrator API also failed:', e2);
            return { executions: [] };
          });
        })
      ]);

      console.log('📊 API Response Data:');
      console.log('KSIs Response:', ksisResponse);
      console.log('Results Response:', resultsResponse);
      console.log('Executions Response:', executionsResponse);

      // Handle different response formats
      const allKSIs = ksisResponse.ksis || ksisResponse.available_ksis || [];
      const results = resultsResponse.results || resultsResponse.data?.results || [];
      const executions = executionsResponse.executions || executionsResponse.data?.executions || [];
      
      // Get KSI management preferences
      const savedPreferences = localStorage.getItem('ksi-management-preferences');
      let activeKSIsList = [];
      let manualKSIsList = [];
      let disabledKSIsList = [];
      
      if (savedPreferences) {
        const preferences = JSON.parse(savedPreferences);
        activeKSIsList = preferences.automated || [];
        manualKSIsList = preferences.manual || [];
        disabledKSIsList = preferences.disabled || [];
        console.log('📋 Using saved KSI preferences:', preferences);
      } else {
        // Auto-categorize if no preferences saved
        allKSIs.forEach(ksi => {
          const result = results.find(r => r.ksi_id === ksi.ksi_id);
          const hasCommands = result && parseInt(result.commands_executed || 0) > 0;
          
          if (hasCommands) {
            activeKSIsList.push(ksi.ksi_id);
          } else {
            manualKSIsList.push(ksi.ksi_id);
          }
        });
        console.log('🔧 Auto-categorized KSIs - Active:', activeKSIsList.length, 'Manual:', manualKSIsList.length);
      }
      
      // Filter results to only include active (automated) KSIs for scoring
      const activeResults = results.filter(r => activeKSIsList.includes(r.ksi_id));
      const allResults = results; // Keep all results for information
      
      console.log('📈 Filtered Data:');
      console.log('Total KSIs:', allKSIs.length);
      console.log('Active KSIs:', activeKSIsList.length);
      console.log('Active Results:', activeResults.length);
      console.log('Manual KSIs:', manualKSIsList.length);
      console.log('Disabled KSIs:', disabledKSIsList.length);
      
      // Calculate metrics based on ACTIVE KSIs only
      const totalActiveKSIs = activeKSIsList.length;
      const passedActiveKSIs = activeResults.filter(r => r.assertion === true).length;
      const failedActiveKSIs = activeResults.filter(r => r.assertion === false).length;
      
      // Find KSIs that are enabled but haven't been validated yet
      const pendingKSIs = activeKSIsList.filter(ksiId => 
        !activeResults.find(r => r.ksi_id === ksiId)
      ).map(ksiId => {
        const ksi = allKSIs.find(k => k.ksi_id === ksiId);
        return {
          ksi_id: ksiId,
          title: ksi?.title || ksi?.description || ksiId,
          status: 'pending',
          assertion: null,
          assertion_reason: `🏃 Validation pending - This KSI has been enabled but not yet executed`,
          timestamp: null,
          commands_executed: 0,
          isPending: true
        };
      });
      
      // Overall metrics include all KSIs for information
      const totalKSIs = allKSIs.length;
      const passedKSIs = allResults.filter(r => r.assertion === true).length;
      const failedKSIs = allResults.filter(r => r.assertion === false).length;
      
      // Calculate compliance based on ACTIVE KSIs only (pending counts as not compliant)
      const activeComplianceRate = totalActiveKSIs > 0 ? (passedActiveKSIs / totalActiveKSIs) * 100 : 0;
      const overallComplianceRate = totalKSIs > 0 ? (passedKSIs / totalKSIs) * 100 : 0;
      
      // Status based on active compliance
      let status = 'healthy';
      if (activeComplianceRate < 90) status = 'warning';
      if (activeComplianceRate < 75) status = 'critical';
      if (totalActiveKSIs === 0) status = 'critical'; // No active KSIs
      if (pendingKSIs.length > 0) status = 'warning'; // Pending validations

      // Get latest validation time and details
      const latestExecution = executions[0];
      const latestResult = allResults.reduce((latest, current) => {
        return new Date(current.timestamp || 0) > new Date(latest.timestamp || 0) ? current : latest;
      }, { timestamp: null });

      // Combine failed validations with pending validations for "issues"
      const failedItems = activeResults.filter(r => r.assertion === false);
      const issueItems = [...failedItems, ...pendingKSIs];
      const totalIssues = failedActiveKSIs + pendingKSIs.length;

      const dashboardState = {
        status,
        lastRun: latestResult.timestamp || latestExecution?.timestamp,
        compliance: Math.round(activeComplianceRate), // Based on active KSIs
        issuesCount: totalIssues, // Failed + Pending
        totalKSIs: totalActiveKSIs, // Show active count as primary
        passedKSIs: passedActiveKSIs,
        failedKSIs: failedActiveKSIs,
        pendingKSIs: pendingKSIs.length,
        priorityItems: issueItems.slice(0, 5), // Failed + Pending items
        executionHistory: executions,
        lastExecutionDetails: latestExecution,
        // New KSI management metrics
        activeKSIs: totalActiveKSIs,
        manualKSIs: manualKSIsList.length,
        disabledKSIs: disabledKSIsList.length,
        automatedCompliance: Math.round(activeComplianceRate),
        // Keep overall metrics for reference
        overallTotalKSIs: totalKSIs,
        overallPassedKSIs: passedKSIs,
        overallFailedKSIs: failedKSIs,
        overallCompliance: Math.round(overallComplianceRate)
      };

      console.log('🎯 Final Dashboard State:', dashboardState);
      setDashboardData(dashboardState);

    } catch (error) {
      console.error('❌ Error loading simplified data:', error);
      setDashboardData(prev => ({ ...prev, status: 'critical' }));
    } finally {
      setLoading(false);
    }
  };

  const getStatusDisplay = (status) => {
    const configs = {
      healthy: { 
        icon: '✅', 
        text: 'All Good', 
        color: 'text-green-600', 
        bg: 'bg-green-50 border-green-200',
        description: 'Everything is running smoothly'
      },
      warning: { 
        icon: '⚠️', 
        text: 'Needs Attention', 
        color: 'text-yellow-600', 
        bg: 'bg-yellow-50 border-yellow-200',
        description: 'Some issues need review'
      },
      critical: { 
        icon: '❌', 
        text: 'Action Required', 
        color: 'text-red-600', 
        bg: 'bg-red-50 border-red-200',
        description: 'Critical issues found'
      }
    };
    return configs[status] || configs.warning;
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never';
    const now = new Date();
    const time = new Date(timestamp);
    const diffHours = Math.floor((now - time) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const handleViewCLIDetails = async (ksi) => {
    setShowCLIDetails(true);
    
    try {
      console.log('🔍 Fetching CLI details for:', ksi);
      
      // Handle pending KSIs differently
      if (ksi.isPending || ksi.status === 'pending') {
        console.log('⏸️ This is a pending KSI - no execution data yet');
        const pendingKSI = {
          ...ksi,
          commands_executed: 0,
          successful_commands: 0,
          failed_commands: 0,
          validation_method: "pending",
          assertion_reason: `⏸️ ${ksi.ksi_id} has been enabled but not yet validated. Click "Run Validation" to execute this KSI and see CLI command details.`,
          cli_command_details: [],
          evidence_path: `Will be: evidence_v2/${ksi.ksi_id}/cli_output.json`
        };
        setSelectedKSI(pendingKSI);
        return;
      }

      // For KSIs with actual execution data
      let detailedKSI = ksi;
      
      const apiClient = {
        get: async (path) => {
          const response = await fetch(`https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev${path}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        }
      };
      
      // Try to get execution-specific details first
      if (ksi.execution_id) {
        try {
          console.log('📊 Trying execution-specific details for:', ksi.execution_id);
          const detailsResponse = await apiClient.get(`/api/ksi/results?tenant_id=tenant-0bf4618d&execution_id=${ksi.execution_id}`);
          console.log('📋 Execution details response:', detailsResponse);
          
          if (detailsResponse.results && detailsResponse.results.length > 0) {
            // Find the specific KSI in the results, or use the first one
            const specificResult = detailsResponse.results.find(r => r.ksi_id === ksi.ksi_id) || detailsResponse.results[0];
            detailedKSI = { ...detailedKSI, ...specificResult };
            console.log('✅ Found execution-specific details for', specificResult.ksi_id);
            
            // If we found good data, use it and stop looking
            if (specificResult.cli_command_details || parseInt(specificResult.commands_executed || 0) > 0) {
              console.log('🎯 Using execution-specific data - stopping here');
              setSelectedKSI(detailedKSI);
              return;
            }
          }
        } catch (error) {
          console.log('⚠️ Could not get execution-specific details:', error);
        }
      }
      
      // If we still don't have good CLI data, try KSI-specific lookup
      if (!detailedKSI.cli_command_details && ksi.ksi_id) {
        try {
          console.log('📊 Trying KSI-specific details for:', ksi.ksi_id);
          const ksiResponse = await apiClient.get(`/api/ksi/results?tenant_id=tenant-0bf4618d`);
          
          if (ksiResponse.results) {
            const matchingKSI = ksiResponse.results.find(r => r.ksi_id === ksi.ksi_id);
            if (matchingKSI && (matchingKSI.cli_command_details || parseInt(matchingKSI.commands_executed || 0) > 0)) {
              detailedKSI = { ...detailedKSI, ...matchingKSI };
              console.log('✅ Found KSI-specific details for', matchingKSI.ksi_id);
              setSelectedKSI(detailedKSI);
              return;
            }
          }
        } catch (error) {
          console.log('⚠️ Could not get KSI-specific details:', error);
        }
      }
      
      // If we still have no CLI data, add sample commands for demonstration
      if (!detailedKSI.cli_command_details && (!detailedKSI.commands_executed || parseInt(detailedKSI.commands_executed) === 0)) {
        console.log('📝 No CLI data found - this might be a policy check');
        detailedKSI.validation_method = "policy_check";
        detailedKSI.assertion_reason = detailedKSI.assertion_reason || `Policy validation - no CLI commands executed`;
      }
      
      console.log('🎯 Final detailed KSI object:', detailedKSI);
      setSelectedKSI(detailedKSI);
      
    } catch (error) {
      console.error('❌ Error loading CLI details:', error);
      setSelectedKSI(ksi);
    }
  };

  const handleKSIManagementSave = (metrics) => {
    console.log('📊 KSI Management updated:', metrics);
    // Reload dashboard with new KSI configuration
    loadSimplifiedData();
  };

  const handleViewFullReport = () => {
    // Generate and download a compliance report
    const reportData = {
      generated: new Date().toISOString(),
      compliance_rate: dashboardData.compliance,
      total_ksis: dashboardData.totalKSIs,
      passed_ksis: dashboardData.passedKSIs,
      failed_ksis: dashboardData.failedKSIs,
      last_validation: dashboardData.lastRun,
      priority_issues: dashboardData.priorityItems,
      execution_history: dashboardData.executionHistory
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fedramp-compliance-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const statusDisplay = getStatusDisplay(dashboardData.status);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Hero Status Section */}
        <div className={`${statusDisplay.bg} border-2 rounded-xl p-8 text-center`}>
          <div className="text-6xl mb-4">{statusDisplay.icon}</div>
          <h1 className={`text-3xl font-bold ${statusDisplay.color} mb-2`}>
            {statusDisplay.text}
          </h1>
          <p className="text-gray-700 mb-6">{statusDisplay.description}</p>
          
          <div className="flex justify-center items-center gap-8 text-sm">
            <div>
              <span className="font-semibold">Compliance: </span>
              <span className={statusDisplay.color}>{dashboardData.compliance}%</span>
            </div>
            <div>
              <span className="font-semibold">Last Check: </span>
              {formatTimeAgo(dashboardData.lastRun)}
            </div>
            {dashboardData.issuesCount > 0 && (
              <div>
                <span className="font-semibold text-red-600">
                  {dashboardData.issuesCount} Issues
                </span>
              </div>
            )}
          </div>

          {/* Last Validation Details */}
          {dashboardData.lastExecutionDetails && (
            <div className="mt-4 pt-4 border-t border-gray-300">
              <div className="text-sm text-gray-600">
                <strong>Last Validation:</strong> {formatTimeAgo(dashboardData.lastExecutionDetails.timestamp)} | 
                <strong> Validators:</strong> {dashboardData.lastExecutionDetails.validators_completed?.length || 0}/5 | 
                <strong> Duration:</strong> {dashboardData.lastExecutionDetails.duration || 'Unknown'}
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Quick Stats - KSI Management Aware */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg p-6 text-center border shadow-sm">
            <div className="text-3xl font-bold text-green-600">{dashboardData.totalKSIs}</div>
            <div className="text-gray-600">⚡ Active KSIs</div>
            <div className="text-xs text-gray-500 mt-1">Used in scoring</div>
          </div>
          <div className="bg-white rounded-lg p-6 text-center border shadow-sm">
            <div className="text-3xl font-bold text-blue-600">{dashboardData.passedKSIs}</div>
            <div className="text-gray-600">✅ Passing</div>
            <div className="text-xs text-gray-500 mt-1">Validated & passing</div>
          </div>
          <div className="bg-white rounded-lg p-6 text-center border shadow-sm">
            <div className="text-3xl font-bold text-red-600">{dashboardData.failedKSIs}</div>
            <div className="text-gray-600">❌ Failed</div>
            <div className="text-xs text-gray-500 mt-1">Need fixing</div>
          </div>
          <div className="bg-white rounded-lg p-6 text-center border shadow-sm">
            <div className="text-3xl font-bold text-orange-600">{dashboardData.pendingKSIs || 0}</div>
            <div className="text-gray-600">⏸️ Pending</div>
            <div className="text-xs text-gray-500 mt-1">Need validation</div>
          </div>
          <div className="bg-white rounded-lg p-6 text-center border shadow-sm">
            <div className="text-3xl font-bold text-purple-600">{dashboardData.compliance}%</div>
            <div className="text-gray-600">🎯 Compliance</div>
            <div className="text-xs text-gray-500 mt-1">Active KSIs only</div>
          </div>
          <div className="bg-white rounded-lg p-6 text-center border shadow-sm">
            <div className="text-lg font-bold text-yellow-600">{dashboardData.manualKSIs}</div>
            <div className="text-lg font-bold text-gray-400">{dashboardData.disabledKSIs}</div>
            <div className="text-gray-600">📋 Manual</div>
            <div className="text-gray-600">⏸️ Disabled</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="border-b">
            <nav className="flex">
              {[
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'issues', label: 'Issues to Fix', icon: '🔧', badge: dashboardData.issuesCount },
                { id: 'execution', label: 'Last Validation', icon: '⚡' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedView(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium ${
                    selectedView === tab.id
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {tab.icon} {tab.label}
                  {tab.badge > 0 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            
            {/* Overview Tab */}
            {selectedView === 'overview' && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  {dashboardData.status === 'healthy' ? (
                    <div className="space-y-4">
                      <div className="text-4xl">🎉</div>
                      <h3 className="text-xl font-semibold text-green-800">
                        All Security Checks Passing!
                      </h3>
                      <p className="text-green-700 max-w-md mx-auto">
                        Great job! Your system meets all security requirements.
                        Next automatic check in 24 hours.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-4xl">👀</div>
                      <h3 className="text-xl font-semibold text-yellow-800">
                        {dashboardData.issuesCount} Item{dashboardData.issuesCount !== 1 ? 's' : ''} Need Your Attention
                      </h3>
                      <p className="text-yellow-700 max-w-md mx-auto mb-4">
                        {dashboardData.failedKSIs > 0 && dashboardData.pendingKSIs > 0 ? 
                          `${dashboardData.failedKSIs} security checks are failing and ${dashboardData.pendingKSIs} need initial validation.` :
                          dashboardData.failedKSIs > 0 ? 
                          `${dashboardData.failedKSIs} security checks are failing and need to be fixed.` :
                          `${dashboardData.pendingKSIs} newly enabled KSIs need initial validation.`
                        }
                      </p>
                      <button 
                        onClick={() => setSelectedView('issues')}
                        className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700"
                      >
                        {dashboardData.pendingKSIs > 0 ? 'Run Validations →' : 'View Issues →'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issues Tab */}
            {selectedView === 'issues' && (
              <div className="space-y-4">
                {dashboardData.priorityItems.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">✅</div>
                    <h3 className="text-xl font-semibold mb-2">No Issues Found!</h3>
                    <p className="text-gray-600">All active security checks are passing.</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold mb-2">🔧 Items That Need Attention</h3>
                      <p className="text-gray-600">
                        {dashboardData.failedKSIs > 0 && dashboardData.pendingKSIs > 0 ? 
                          `${dashboardData.failedKSIs} failing validations and ${dashboardData.pendingKSIs} pending validations need your attention.` :
                          dashboardData.failedKSIs > 0 ? 
                          `${dashboardData.failedKSIs} security checks are currently failing and need your attention.` :
                          `${dashboardData.pendingKSIs} newly enabled KSIs need initial validation.`
                        }
                      </p>
                    </div>
                    
                    {/* Quick Actions for Pending */}
                    {dashboardData.pendingKSIs > 0 && (
                      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-blue-800">⏸️ {dashboardData.pendingKSIs} KSIs Need Initial Validation</h4>
                            <p className="text-sm text-blue-700">These KSIs were recently enabled but haven't been validated yet.</p>
                          </div>
                          <button 
                            onClick={() => {
                              // TODO: Trigger validation for all pending KSIs
                              alert(`Would trigger validation for ${dashboardData.pendingKSIs} pending KSIs`);
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                          >
                            Run All Pending →
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {dashboardData.priorityItems.map((item, index) => (
                      <div key={item.ksi_id} className={`border rounded-lg p-4 ${
                        item.isPending ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-lg ${item.isPending ? 'text-blue-600' : 'text-red-600'}`}>
                                {item.isPending ? '⏸️' : '❌'}
                              </span>
                              <h4 className={`font-semibold ${item.isPending ? 'text-blue-800' : 'text-red-800'}`}>
                                {item.ksi_id}
                              </h4>
                              <span className={`text-xs px-2 py-1 rounded ${
                                item.isPending ? 'bg-blue-200 text-blue-800' : 'bg-red-200 text-red-800'
                              }`}>
                                {item.isPending ? 'Pending Validation' : `Priority ${index + 1}`}
                              </span>
                            </div>
                            <h5 className={`font-medium mb-2 ${item.isPending ? 'text-blue-800' : 'text-red-800'}`}>
                              {item.title}
                            </h5>
                            <p className={`text-sm mb-2 ${item.isPending ? 'text-blue-700' : 'text-red-700'}`}>
                              {item.assertion_reason?.substring(0, 150)}...
                            </p>
                            <div className={`text-xs mb-2 ${item.isPending ? 'text-blue-600' : 'text-red-600'}`}>
                              {item.isPending ? 
                                'Never executed - Run validation to check compliance' :
                                `Last checked: ${formatTimeAgo(item.timestamp)}`
                              }
                            </div>
                          </div>
                          <div className="ml-4 flex flex-col gap-2">
                            {item.isPending ? (
                              <>
                                <button 
                                  onClick={() => {
                                    // TODO: Trigger single KSI validation
                                    alert(`Would trigger validation for ${item.ksi_id}`);
                                  }}
                                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                                >
                                  Run Validation →
                                </button>
                                <button 
                                  onClick={() => handleViewCLIDetails(item)}
                                  className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                                >
                                  View Info
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
                                <button className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700">
                                  Fix This →
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Execution Tab */}
            {selectedView === 'execution' && (
              <div className="space-y-4">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">⚡ Last Validation Details</h3>
                  <p className="text-gray-600">Recent complete validation runs and orchestrator execution information.</p>
                </div>

                {dashboardData.executionHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-4">📋</div>
                    <div className="text-lg mb-2">No orchestrator runs available</div>
                    <div className="text-sm">Complete validation runs will appear here after execution</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dashboardData.executionHistory.slice(0, 3).map(execution => (
                      <div key={execution.execution_id} className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-medium text-lg mb-1">
                              {execution.execution_id.includes('orchestrator') ? 
                                '🔄 Complete Validation Run' : 
                                `📋 Validation Execution`}
                            </div>
                            <div className="text-sm text-gray-600">
                              {formatTimeAgo(execution.timestamp)} | 
                              Status: <span className={`font-medium ${
                                execution.status === 'completed' ? 'text-green-600' :
                                execution.status === 'running' ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>{execution.status}</span> | 
                              Duration: {execution.duration || 'Unknown'}
                            </div>
                          </div>
                          <button 
                            onClick={() => handleViewCLIDetails(execution)}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                          >
                            View Details
                          </button>
                        </div>
                        
                        {/* Enhanced execution details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="bg-blue-50 p-2 rounded text-center">
                            <div className="font-bold text-blue-600">
                              {execution.validators_completed?.length || execution.total_ksis_validated || 'N/A'}
                            </div>
                            <div className="text-blue-800 text-xs">KSIs/Validators</div>
                          </div>
                          <div className="bg-green-50 p-2 rounded text-center">
                            <div className="font-bold text-green-600">
                              {execution.validators_requested || execution.validators_completed?.length || 'N/A'}
                            </div>
                            <div className="text-green-800 text-xs">Requested</div>
                          </div>
                          <div className="bg-yellow-50 p-2 rounded text-center">
                            <div className="font-bold text-yellow-600">
                              {execution.trigger_source || 'manual'}
                            </div>
                            <div className="text-yellow-800 text-xs">Trigger</div>
                          </div>
                          <div className="bg-purple-50 p-2 rounded text-center">
                            <div className="font-bold text-purple-600">
                              {execution.execution_id?.split('-').pop()?.substring(0, 6) || 'N/A'}
                            </div>
                            <div className="text-purple-800 text-xs">Run ID</div>
                          </div>
                        </div>
                        
                        {execution.validators_completed && Array.isArray(execution.validators_completed) && (
                          <div className="mt-3 text-sm">
                            <span className="font-medium">Validators Completed:</span> 
                            <div className="flex flex-wrap gap-1 mt-1">
                              {execution.validators_completed.map(validator => (
                                <span key={validator} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                  {validator.toUpperCase()}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Orchestrator Info */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">🏗️ Orchestrator Information</h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <div>• <strong>Daily Schedule:</strong> 6:00 AM UTC via EventBridge</div>
                    <div>• <strong>Validators:</strong> CNA, SVC, IAM, MLA, CMT (5 categories)</div>
                    <div>• <strong>Complete Runs:</strong> All 51 KSIs validated per execution</div>
                    <div>• <strong>Execution History:</strong> 90-day retention with TTL</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Quick Actions - With KSI Management */}
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">🚀 Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button 
              onClick={() => setShowKSIManagement(true)}
              className="flex items-center gap-3 p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-left bg-blue-25"
            >
              <span className="text-2xl">🎛️</span>
              <div>
                <div className="font-medium text-blue-800">Manage KSIs</div>
                <div className="text-sm text-blue-600">Configure active validations</div>
              </div>
            </button>
            
            <button 
              onClick={loadSimplifiedData}
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 text-left"
            >
              <span className="text-2xl">🔄</span>
              <div>
                <div className="font-medium">Refresh Status</div>
                <div className="text-sm text-gray-600">Check for updates</div>
              </div>
            </button>
            
            <button 
              onClick={handleViewFullReport}
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 text-left"
            >
              <span className="text-2xl">📊</span>
              <div>
                <div className="font-medium">Download Report</div>
                <div className="text-sm text-gray-600">Compliance report (JSON)</div>
              </div>
            </button>

            <button 
              onClick={() => {
                // Show overall metrics breakdown
                alert(`Overall KSI Breakdown:
                
Active (Automated): ${dashboardData.activeKSIs} KSIs
Manual (Informational): ${dashboardData.manualKSIs} KSIs  
Disabled: ${dashboardData.disabledKSIs} KSIs
Total: ${dashboardData.overallTotalKSIs || dashboardData.activeKSIs + dashboardData.manualKSIs + dashboardData.disabledKSIs} KSIs

Compliance Score: ${dashboardData.compliance}% (based on active KSIs only)
Overall Results: ${dashboardData.overallPassedKSIs || 'N/A'} passed, ${dashboardData.overallFailedKSIs || 'N/A'} failed`);
              }}
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 text-left"
            >
              <span className="text-2xl">📈</span>
              <div>
                <div className="font-medium">View Breakdown</div>
                <div className="text-sm text-gray-600">Detailed metrics</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* CLI Details Modal */}
      {showCLIDetails && selectedKSI && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  CLI Details: {selectedKSI.ksi_id || selectedKSI.execution_id}
                </h2>
                <button
                  onClick={() => setShowCLIDetails(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* KSI Information */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">📋 Validation Information:</h3>
                <div className="bg-gray-100 p-3 rounded text-sm space-y-1">
                  <div><strong>KSI ID:</strong> {selectedKSI.ksi_id || selectedKSI.execution_id || 'Unknown'}</div>
                  <div><strong>Status:</strong> 
                    <span className={`ml-1 px-2 py-1 rounded text-xs ${
                      selectedKSI.assertion === true ? 'bg-green-100 text-green-800' :
                      selectedKSI.assertion === false ? 'bg-red-100 text-red-800' :
                      selectedKSI.isPending || selectedKSI.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedKSI.assertion === true ? '✅ PASSED' : 
                       selectedKSI.assertion === false ? '❌ FAILED' : 
                       selectedKSI.isPending || selectedKSI.status === 'pending' ? '⏸️ PENDING' :
                       selectedKSI.status || 'Unknown'}
                    </span>
                  </div>
                  <div><strong>Last Check:</strong> {formatTimeAgo(selectedKSI.timestamp)}</div>
                </div>
              </div>

              {/* Validation Result */}
              {selectedKSI.assertion_reason && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">🔍 Validation Result:</h3>
                  <div className="bg-gray-100 p-3 rounded text-sm">
                    {selectedKSI.assertion_reason}
                  </div>
                </div>
              )}
              
              {/* Command Summary */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">💻 Command Execution Summary:</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-blue-50 p-3 rounded text-center">
                    <div className="font-bold text-lg text-blue-600">
                      {selectedKSI.commands_executed || selectedKSI.total_commands || 'Unknown'}
                    </div>
                    <div className="text-blue-800">Total Commands</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded text-center">
                    <div className="font-bold text-lg text-green-600">
                      {selectedKSI.successful_commands || 'Unknown'}
                    </div>
                    <div className="text-green-800">Successful</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded text-center">
                    <div className="font-bold text-lg text-red-600">
                      {selectedKSI.failed_commands || 0}
                    </div>
                    <div className="text-red-800">Failed</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded text-center">
                    <div className="font-bold text-lg text-purple-600">
                      {selectedKSI.execution_time || 'Unknown'}
                    </div>
                    <div className="text-purple-800">Duration</div>
                  </div>
                </div>
              </div>
              
              {/* CLI Commands Display */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">⚡ CLI Commands Executed:</h3>
                
                {/* Handle pending KSIs */}
                {selectedKSI.validation_method === "pending" ? (
                  <div className="bg-blue-50 border border-blue-200 rounded p-4">
                    <div className="text-blue-800 text-center">
                      <div className="text-3xl mb-3">⏸️</div>
                      <div className="font-semibold mb-2">Validation Pending</div>
                      <div className="text-sm mb-4">
                        This KSI has been enabled but not yet executed. Run the validation to see CLI command details and compliance results.
                      </div>
                      <div className="space-y-2">
                        <button
                          onClick={() => {
                            alert(`Would trigger validation for ${selectedKSI.ksi_id}`);
                          }}
                          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mr-2"
                        >
                          🚀 Run Validation Now
                        </button>
                        <button
                          onClick={() => {
                            alert(`Would trigger validation for all pending KSIs`);
                          }}
                          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                        >
                          🔄 Run All Pending
                        </button>
                      </div>
                    </div>
                  </div>
                ) : 
                
                /* Try to show detailed CLI commands first */
                selectedKSI.cli_command_details && selectedKSI.cli_command_details.length > 0 ? (
                  <div className="space-y-3">
                    {selectedKSI.cli_command_details.map((cmd, index) => (
                      <div key={index} className={`border rounded p-3 ${
                        cmd.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Command {index + 1}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            cmd.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {cmd.success ? '✅ Success' : '❌ Failed'}
                          </span>
                        </div>
                        <div className="bg-gray-900 text-green-400 p-2 rounded font-mono text-sm mb-2">
                          {cmd.command || 'Command details not available'}
                        </div>
                        {cmd.description && (
                          <div className="text-sm text-gray-600">
                            <strong>Description:</strong> {cmd.description}
                          </div>
                        )}
                        {cmd.execution_time && (
                          <div className="text-sm text-gray-600">
                            <strong>Execution Time:</strong> {cmd.execution_time}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : selectedKSI.cli_command ? (
                  /* Show summary CLI command if detailed not available */
                  <div className="space-y-3">
                    <div className="bg-gray-100 p-3 rounded">
                      <div className="font-medium mb-2">Commands Summary:</div>
                      <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                        {selectedKSI.cli_command}
                      </div>
                    </div>
                  </div>
                ) : selectedKSI.validation_method === "policy_check" ? (
                  /* Show policy check explanation */
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <div className="text-yellow-800">
                      <div className="text-center mb-3">
                        <div className="text-2xl mb-2">📋</div>
                        <strong>Policy Check Validation</strong>
                      </div>
                      <div className="text-sm">
                        This validation is a policy or configuration check that doesn't require CLI command execution. 
                        The validation examines system settings, configurations, or documentation to determine compliance.
                      </div>
                    </div>
                  </div>
                ) : (
                  /* No command information available */
                  <div className="bg-gray-50 border border-gray-200 rounded p-3">
                    <div className="text-gray-600 text-center">
                      <div className="text-2xl mb-2">📋</div>
                      <div>No detailed command information available for this validation.</div>
                      <div className="text-sm mt-1">
                        This may be a policy check or configuration validation that doesn't require CLI execution.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Technical Details */}
              {(selectedKSI.evidence_path || selectedKSI.cli_output_digest || selectedKSI.validation_method) && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">🔧 Technical Details:</h3>
                  <div className="bg-gray-100 p-3 rounded text-sm space-y-1">
                    {selectedKSI.evidence_path && (
                      <div><strong>Evidence Path:</strong> {selectedKSI.evidence_path}</div>
                    )}
                    {selectedKSI.cli_output_digest && (
                      <div><strong>Output Digest:</strong> {selectedKSI.cli_output_digest}</div>
                    )}
                    {selectedKSI.validation_method && (
                      <div><strong>Validation Method:</strong> {selectedKSI.validation_method}</div>
                    )}
                    {selectedKSI.requirement && (
                      <div><strong>FedRAMP Requirement:</strong> {selectedKSI.requirement}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  📊 FedRAMP 20X Compliance Evidence | Audit Trail Available
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      console.log('Selected KSI Data Structure:', selectedKSI);
                      alert('Check browser console for complete data structure');
                    }}
                    className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                  >
                    Debug Data
                  </button>
                  <button
                    onClick={() => setShowCLIDetails(false)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Close
                  </button>
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
          onSave={handleKSIManagementSave}
        />
      )}
    </div>
  );
};

// Enhanced KSI Manager Component - Uses Same Data as Simple View
const EnhancedKSIManager = () => {
  const [dashboardData, setDashboardData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdvancedData();
  }, []);

  const loadAdvancedData = async () => {
    try {
      setLoading(true);
      
      const apiClient = {
        get: async (path) => {
          const response = await fetch(`https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev${path}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        }
      };
      
      console.log('🔍 Loading advanced dashboard data (synced with Simple)...');
      
      const [ksisResponse, resultsResponse, executionsResponse] = await Promise.all([
        apiClient.get('/api/admin/ksi-defaults'),
        apiClient.get('/api/ksi/results?tenant_id=tenant-0bf4618d'), 
        apiClient.get('/api/ksi/executions?tenant_id=tenant-0bf4618d&limit=10')
      ]);

      // Use SAME logic as Simple view
      const allKSIs = ksisResponse.available_ksis || [];
      const results = resultsResponse.results || [];
      const executions = executionsResponse.executions || [];
      
      // Get SAME preferences as Simple view
      const savedPreferences = localStorage.getItem('ksi-management-preferences');
      let activeKSIsList = [];
      
      if (savedPreferences) {
        const preferences = JSON.parse(savedPreferences);
        activeKSIsList = preferences.automated || [];
        console.log('🔄 Advanced view using SAME preferences as Simple:', preferences);
      } else {
        // Same auto-categorization as Simple
        allKSIs.forEach(ksi => {
          const result = results.find(r => r.ksi_id === ksi.ksi_id);
          const hasCommands = result && parseInt(result.commands_executed || 0) > 0;
          if (hasCommands) {
            activeKSIsList.push(ksi.ksi_id);
          }
        });
      }
      
      // Filter to active results (same as Simple)
      const activeResults = results.filter(r => activeKSIsList.includes(r.ksi_id));
      
      const dashboardState = {
        totalKSIs: activeKSIsList.length,
        totalResults: activeResults.length,
        passedKSIs: activeResults.filter(r => r.assertion === true).length,
        failedKSIs: activeResults.filter(r => r.assertion === false).length,
        compliance: activeKSIsList.length > 0 ? Math.round((activeResults.filter(r => r.assertion === true).length / activeKSIsList.length) * 100) : 0,
        results: activeResults,
        executions: executions,
        allKSIs: allKSIs.filter(k => activeKSIsList.includes(k.ksi_id))
      };
      
      console.log('🎯 Advanced Dashboard State (synced):', dashboardState);
      setDashboardData(dashboardState);
      
    } catch (error) {
      console.error('❌ Error loading advanced data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <div className="text-lg font-medium">Loading advanced dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      
      {/* Sync Notice */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">🔄 Synced with Simple View</h3>
        <p className="text-sm text-blue-700">
          This advanced view now shows the same {dashboardData.totalKSIs} active KSIs as your Simple dashboard. 
          Both views use your saved KSI management preferences for consistency.
        </p>
      </div>

      {/* Stats matching Simple view */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center">
            <div className="text-blue-500 mr-3 text-2xl">⚡</div>
            <div>
              <h3 className="text-lg font-semibold">Active KSIs</h3>
              <p className="text-2xl font-bold text-blue-600">{dashboardData.totalKSIs}</p>
              <p className="text-xs text-gray-500">Used in scoring</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="text-green-500 mr-3 text-2xl">✅</div>
            <div>
              <h3 className="text-lg font-semibold">Passing</h3>
              <p className="text-2xl font-bold text-green-600">{dashboardData.passedKSIs}</p>
              <p className="text-xs text-gray-500">Active validations</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="text-red-500 mr-3 text-2xl">❌</div>
            <div>
              <h3 className="text-lg font-semibold">Failed</h3>
              <p className="text-2xl font-bold text-red-600">{dashboardData.failedKSIs}</p>
              <p className="text-xs text-gray-500">Need attention</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="text-purple-500 mr-3 text-2xl">🎯</div>
            <div>
              <h3 className="text-lg font-semibold">Compliance</h3>
              <p className="text-2xl font-bold text-purple-600">{dashboardData.compliance}%</p>
              <p className="text-xs text-gray-500">Active KSIs only</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced technical details */}
      <div className="card p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">🔬 Technical Details</h2>
        
        <div className="mb-6">
          <h3 className="font-semibold mb-2">Recent Validation Results</h3>
          <div className="space-y-2">
            {dashboardData.results?.slice(0, 5).map(result => (
              <div key={result.ksi_id} className={`p-3 rounded-lg border ${
                result.assertion ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{result.ksi_id}</span>
                    <span className={`ml-2 px-2 py-1 text-xs rounded ${
                      result.assertion ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {result.assertion ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {result.commands_executed || 0} commands | {new Date(result.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold mb-2">Recent Executions</h3>
          <div className="space-y-2">
            {dashboardData.executions?.slice(0, 3).map(execution => (
              <div key={execution.execution_id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{execution.execution_id}</span>
                    <span className="ml-2 text-sm text-gray-600">
                      {execution.trigger_source} | {execution.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {new Date(execution.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
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
                {viewMode === 'simple' ? '✨ Simplified View' : '🔬 Advanced View'}
              </span>
            </div>
            
            {/* Mode Toggle Controls */}
            <div className="flex items-center gap-3">
              
              {/* Help Button */}
              <button
                onClick={() => setShowModeInfo(!showModeInfo)}
                className="text-gray-600 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100"
                title="View mode information"
              >
                ❓
              </button>
              
              {/* Mode Toggle Switch */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('simple')}
                  className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                    viewMode === 'simple'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ✨ Simple
                </button>
                <button
                  onClick={() => setViewMode('advanced')}
                  className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                    viewMode === 'advanced'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🔬 Advanced
                </button>
              </div>
            </div>
          </div>
          
          {/* Mode Information Panel */}
          {showModeInfo && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-blue-800 mb-2">✨ Simple View</h3>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Clear status at a glance</li>
                    <li>• Pending KSI management</li>
                    <li>• Working CLI details & reports</li>
                    <li>• Perfect for daily check-ins</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-blue-800 mb-2">🔬 Advanced View</h3>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Technical execution details</li>
                    <li>• Complete validation history</li>
                    <li>• Synced with Simple view data</li>
                    <li>• For technical analysis</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 text-center">
                <button
                  onClick={() => setShowModeInfo(false)}
                  className="text-blue-600 hover:text-blue-800 text-sm underline"
                >
                  Got it, close this →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard Content */}
      {viewMode === 'simple' ? (
        <SimplifiedDashboard />
      ) : (
        <EnhancedKSIManager />
      )}
    </div>
  );
};

export default DualDashboard;
