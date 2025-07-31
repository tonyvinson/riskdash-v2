import React, { useState, useEffect } from 'react';

const KSIManagementModal = ({ isOpen, onClose, onSave }) => {
  const [ksiCategories, setKsiCategories] = useState({
    automated: [],
    manual: [],
    disabled: []
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('automated');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadKSIData();
    }
  }, [isOpen]);

  const loadKSIData = async () => {
    try {
      setLoading(true);
      
      // Get all available KSIs
      const response = await fetch('https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev/api/admin/ksi-defaults');
      const data = await response.json();
      const allKSIs = data.available_ksis || [];

      // Get current results to determine which have CLI commands
      const resultsResponse = await fetch('https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev/api/ksi/results?tenant_id=tenant-0bf4618d');
      const resultsData = await resultsResponse.json();
      const results = resultsData.results || [];

      console.log('🔍 Modal KSI Analysis:');
      console.log('Total KSIs:', allKSIs.length);
      console.log('Results available:', results.length);

      // Categorize KSIs using EXACT SAME LOGIC as dashboard
      const categorized = {
        automated: [],
        manual: [],
        disabled: []
      };

      allKSIs.forEach(ksi => {
        const result = results.find(r => r.ksi_id === ksi.ksi_id);
        const commandsExecuted = parseInt(result?.commands_executed || 0);
        const hasCommands = commandsExecuted > 0;
        
        const ksiWithStatus = {
          ...ksi,
          hasCommands,
          lastRun: result?.timestamp,
          status: result?.assertion,
          commandCount: commandsExecuted,
          category: ksi.category || 'Unknown'
        };

        console.log(`📋 ${ksi.ksi_id}: commands=${commandsExecuted}, hasCommands=${hasCommands}`);

        // ✅ EXACT SAME LOGIC AS DASHBOARD
        if (hasCommands) {
          categorized.automated.push(ksiWithStatus);
        } else {
          categorized.manual.push(ksiWithStatus);
        }
      });

      console.log('📊 Modal Categorization Results:');
      console.log('Automated:', categorized.automated.length, categorized.automated.map(k => k.ksi_id));
      console.log('Manual:', categorized.manual.length);

      // ⚠️ IGNORE SAVED PREFERENCES FOR NOW - USE DETECTION LOGIC
      // This ensures modal matches dashboard exactly
      setKsiCategories(categorized);
      
    } catch (error) {
      console.error('Error loading KSI data:', error);
    } finally {
      setLoading(false);
    }
  };

  const moveKSI = (ksi, fromCategory, toCategory) => {
    setKsiCategories(prev => ({
      ...prev,
      [fromCategory]: prev[fromCategory].filter(k => k.ksi_id !== ksi.ksi_id),
      [toCategory]: [...prev[toCategory], ksi].sort((a, b) => a.ksi_id.localeCompare(b.ksi_id))
    }));
  };

  const handleSave = () => {
    // Save preferences to localStorage and callback
    const preferences = {
      automated: ksiCategories.automated.map(k => k.ksi_id),
      manual: ksiCategories.manual.map(k => k.ksi_id),
      disabled: ksiCategories.disabled.map(k => k.ksi_id)
    };
    
    localStorage.setItem('ksi-management-preferences', JSON.stringify(preferences));
    
    // Calculate new metrics based on active KSIs
    const activeKSIs = ksiCategories.automated;
    const metrics = {
      totalActiveKSIs: activeKSIs.length,
      automatedKSIs: activeKSIs.filter(k => k.hasCommands).length,
      manualKSIs: ksiCategories.manual.length,
      disabledKSIs: ksiCategories.disabled.length,
      activeKSIsList: activeKSIs.map(k => k.ksi_id)
    };
    
    console.log('💾 Saving KSI preferences:', preferences);
    console.log('📊 New metrics:', metrics);
    
    onSave(metrics);
    onClose();
  };

  const resetToDetection = () => {
    if (window.confirm('Reset to automatic detection based on CLI command execution?')) {
      localStorage.removeItem('ksi-management-preferences');
      loadKSIData();
    }
  };

  const filterKSIs = (ksis) => {
    if (!searchTerm) return ksis;
    return ksis.filter(ksi => 
      ksi.ksi_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ksi.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ksi.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getCategoryColor = (category) => {
    const colors = {
      automated: 'border-green-200 bg-green-50',
      manual: 'border-yellow-200 bg-yellow-50',
      disabled: 'border-red-200 bg-red-50'
    };
    return colors[category] || 'border-gray-200 bg-gray-50';
  };

  const getCategoryIcon = (category) => {
    const icons = {
      automated: '⚡',
      manual: '📋',
      disabled: '⏸️'
    };
    return icons[category] || '📄';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                🎛️ KSI Management - Control Active Validations
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Configure which KSIs are included in compliance scoring (based on CLI command execution)
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="px-6 py-4 bg-blue-50 border-b">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{ksiCategories.automated.length}</div>
              <div className="text-sm text-gray-600">⚡ Automated (Active)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{ksiCategories.manual.length}</div>
              <div className="text-sm text-gray-600">📋 Manual (Informational)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{ksiCategories.disabled.length}</div>
              <div className="text-sm text-gray-600">⏸️ Disabled</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {ksiCategories.automated.length + ksiCategories.manual.length + ksiCategories.disabled.length}
              </div>
              <div className="text-sm text-gray-600">📊 Total KSIs</div>
            </div>
          </div>
          
          {/* Reset Button */}
          <div className="mt-3 text-center">
            <button
              onClick={resetToDetection}
              className="text-blue-600 hover:text-blue-800 text-sm underline"
            >
              🔄 Reset to Auto-Detection (Based on CLI Commands)
            </button>
          </div>
        </div>

        {/* Search and Tabs */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              {[
                { id: 'automated', label: '⚡ Automated', color: 'text-green-600' },
                { id: 'manual', label: '📋 Manual', color: 'text-yellow-600' },
                { id: 'disabled', label: '⏸️ Disabled', color: 'text-red-600' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-white shadow-sm text-gray-900'
                      : `text-gray-600 hover:text-gray-900 ${tab.color}`
                  }`}
                >
                  {tab.label} ({ksiCategories[tab.id].length})
                </button>
              ))}
            </div>
            
            <input
              type="text"
              placeholder="Search KSIs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64"
            />
          </div>
        </div>

        {/* KSI List */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {loading ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">⏳</div>
              <div>Loading KSI data...</div>
            </div>
          ) : (
            <div className="space-y-3">
              {filterKSIs(ksiCategories[activeTab]).map(ksi => (
                <div
                  key={ksi.ksi_id}
                  className={`border rounded-lg p-4 ${getCategoryColor(activeTab)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{getCategoryIcon(activeTab)}</span>
                        <h4 className="font-semibold">{ksi.ksi_id}</h4>
                        <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded">
                          {ksi.category}
                        </span>
                        {ksi.hasCommands && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {ksi.commandCount} CLI commands
                          </span>
                        )}
                        {!ksi.hasCommands && (
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                            Policy check
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-700 mb-2">
                        {ksi.title || ksi.description || 'No description available'}
                      </p>
                      
                      <div className="text-xs text-gray-600">
                        {ksi.lastRun ? (
                          <>
                            Last run: {new Date(ksi.lastRun).toLocaleDateString()} | 
                            Status: {ksi.status ? '✅ Passed' : '❌ Failed'}
                          </>
                        ) : (
                          'Never executed'
                        )}
                      </div>
                    </div>
                    
                    {/* Move buttons */}
                    <div className="ml-4 flex flex-col gap-1">
                      {activeTab !== 'automated' && (
                        <button
                          onClick={() => moveKSI(ksi, activeTab, 'automated')}
                          className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                        >
                          → Automated
                        </button>
                      )}
                      {activeTab !== 'manual' && (
                        <button
                          onClick={() => moveKSI(ksi, activeTab, 'manual')}
                          className="bg-yellow-600 text-white px-3 py-1 rounded text-xs hover:bg-yellow-700"
                        >
                          → Manual
                        </button>
                      )}
                      {activeTab !== 'disabled' && (
                        <button
                          onClick={() => moveKSI(ksi, activeTab, 'disabled')}
                          className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
                        >
                          → Disabled
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {filterKSIs(ksiCategories[activeTab]).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📭</div>
                  <div>No KSIs in this category</div>
                  {searchTerm && <div className="text-sm mt-1">Try adjusting your search</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <strong>Automated KSIs</strong> have CLI commands and will be included in compliance scoring. 
              <strong>Manual KSIs</strong> are policy/document checks (informational only).
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KSIManagementModal;
