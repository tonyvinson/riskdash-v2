import React, { useState, useEffect } from 'react';

const KSIManagementModal = ({ isOpen, onClose, availableKSIs = [], onSave }) => {
  const [preferences, setPreferences] = useState({
    automated: [],
    manual: [],
    disabled: []
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // KSI Categories
  const categories = {
    'all': 'All Categories',
    'CNA': 'Configuration & Network Architecture',
    'SVC': 'Service Configuration', 
    'IAM': 'Identity & Access Management',
    'MLA': 'Monitoring, Logging & Alerting',
    'CMT': 'Configuration Management & Tracking'
  };

  useEffect(() => {
    if (isOpen) {
      loadCurrentPreferences();
    }
  }, [isOpen]);

  const loadCurrentPreferences = () => {
    try {
      const saved = localStorage.getItem('ksi-management-preferences');
      if (saved) {
        const parsedPreferences = JSON.parse(saved);
        setPreferences(parsedPreferences);
      } else {
        // Initialize with auto-detected preferences
        autoDetectPreferences();
      }
    } catch (error) {
      console.error('Error loading KSI preferences:', error);
      autoDetectPreferences();
    }
  };

  const autoDetectPreferences = async () => {
    try {
      // Fetch current results to detect which KSIs have been run
      const response = await fetch('https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev/api/ksi/results?tenant_id=tenant-0bf4618d');
      const data = await response.json();
      const results = data.results || [];

      const automated = [];
      const manual = [];

      availableKSIs.forEach(ksi => {
        const result = results.find(r => r.ksi_id === ksi.ksi_id);
        const commandsExecuted = parseInt(result?.commands_executed || 0);
        
        if (commandsExecuted > 0) {
          automated.push(ksi.ksi_id);
        } else {
          manual.push(ksi.ksi_id);
        }
      });

      setPreferences({
        automated,
        manual,
        disabled: []
      });

      console.log('Auto-detected KSI preferences:', { automated: automated.length, manual: manual.length });
    } catch (error) {
      console.error('Error auto-detecting preferences:', error);
      // Fallback: put all KSIs in manual
      setPreferences({
        automated: [],
        manual: availableKSIs.map(ksi => ksi.ksi_id),
        disabled: []
      });
    }
  };

  const moveKSI = (ksiId, fromCategory, toCategory) => {
    setPreferences(prev => {
      const newPrefs = { ...prev };
      
      // Remove from source category
      newPrefs[fromCategory] = newPrefs[fromCategory].filter(id => id !== ksiId);
      
      // Add to target category
      if (!newPrefs[toCategory].includes(ksiId)) {
        newPrefs[toCategory].push(ksiId);
      }
      
      return newPrefs;
    });
    
    setHasChanges(true);
  };

  const getKSICategory = (ksiId) => {
    if (preferences.automated.includes(ksiId)) return 'automated';
    if (preferences.manual.includes(ksiId)) return 'manual';
    if (preferences.disabled.includes(ksiId)) return 'disabled';
    return 'manual'; // default
  };

  const getKSIDisplay = (ksi, category) => {
    return {
      ...ksi,
      currentCategory: category,
      categoryLabel: {
        'automated': 'Active',
        'manual': 'Manual',
        'disabled': 'Disabled'
      }[category] || 'Unknown'
    };
  };

  const filteredKSIs = availableKSIs.filter(ksi => {
    // Filter by search term
    if (searchTerm && !ksi.ksi_id.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(ksi.description || '').toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    // Filter by category
    if (selectedCategory !== 'all') {
      const ksiCategory = ksi.ksi_id.split('-')[1];
      if (ksiCategory !== selectedCategory) {
        return false;
      }
    }
    
    return true;
  });

  const handleSave = () => {
    onSave(preferences);
    setHasChanges(false);
  };

  const handleReset = () => {
    loadCurrentPreferences();
    setHasChanges(false);
  };

  const getCategoryStats = () => {
    return {
      automated: preferences.automated.length,
      manual: preferences.manual.length,
      disabled: preferences.disabled.length,
      total: availableKSIs.length
    };
  };

  if (!isOpen) return null;

  const stats = getCategoryStats();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold">⚙️ Configure KSI Automation</h2>
            <p className="text-gray-600 text-sm">Choose which KSIs are actively validated and included in compliance calculations</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-3 rounded-lg text-center">
            <div className="text-lg font-bold text-blue-600">{stats.automated}</div>
            <div className="text-xs text-blue-700">Active KSIs</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg text-center">
            <div className="text-lg font-bold text-gray-600">{stats.manual}</div>
            <div className="text-xs text-gray-700">Manual KSIs</div>
          </div>
          <div className="bg-red-50 p-3 rounded-lg text-center">
            <div className="text-lg font-bold text-red-600">{stats.disabled}</div>
            <div className="text-xs text-red-700">Disabled KSIs</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg text-center">
            <div className="text-lg font-bold text-green-600">{stats.total}</div>
            <div className="text-xs text-green-700">Total KSIs</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search KSIs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KSI List */}
        <div className="border rounded-lg mb-6 max-h-96 overflow-y-auto">
          <div className="bg-gray-50 px-4 py-2 border-b font-medium text-sm">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4">KSI ID</div>
              <div className="col-span-5">Description</div>
              <div className="col-span-2">Current Status</div>
              <div className="col-span-1">Actions</div>
            </div>
          </div>
          
          <div className="divide-y">
            {filteredKSIs.map(ksi => {
              const currentCategory = getKSICategory(ksi.ksi_id);
              const displayKSI = getKSIDisplay(ksi, currentCategory);
              
              return (
                <div key={ksi.ksi_id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-4">
                      <span className="font-medium text-sm">{ksi.ksi_id}</span>
                    </div>
                    <div className="col-span-5">
                      <span className="text-sm text-gray-600">
                        {ksi.description || ksi.purpose || 'No description available'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        currentCategory === 'automated' ? 'bg-blue-100 text-blue-800' :
                        currentCategory === 'manual' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {displayKSI.categoryLabel}
                      </span>
                    </div>
                    <div className="col-span-1">
                      <select
                        value={currentCategory}
                        onChange={(e) => moveKSI(ksi.ksi_id, currentCategory, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="automated">Active</option>
                        <option value="manual">Manual</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Help Text */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-blue-800 mb-2">💡 KSI Categories Explained</h4>
          <div className="text-sm text-blue-700 space-y-1">
            <div><strong>Active:</strong> Included in automated validation runs and compliance calculations</div>
            <div><strong>Manual:</strong> Available for on-demand validation but not included in automated compliance scoring</div>
            <div><strong>Disabled:</strong> Not validated automatically or manually (use for KSIs not applicable to your environment)</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <div>
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset Changes
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Configuration
            </button>
          </div>
        </div>

        {hasChanges && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="text-sm text-yellow-800">
              ⚠️ You have unsaved changes. Click "Save Configuration" to apply your changes to the dashboard and compliance calculations.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KSIManagementModal;
