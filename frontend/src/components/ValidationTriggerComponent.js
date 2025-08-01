import React, { useState, useEffect } from 'react';

const ValidationTriggerComponent = ({ 
  tenantId = 'tenant-0bf4618d', 
  onValidationStarted, 
  onValidationCompleted,
  availableKSIs = [],
  ksiService 
}) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null);
  const [selectedKSIs, setSelectedKSIs] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showKSISelector, setShowKSISelector] = useState(false);

  // KSI Categories
  const categories = {
    'all': 'All Categories',
    'CNA': 'Configuration & Network Architecture',
    'SVC': 'Service Configuration', 
    'IAM': 'Identity & Access Management',
    'MLA': 'Monitoring, Logging & Alerting',
    'CMT': 'Configuration Management & Tracking'
  };

  // Group KSIs by category
  const ksisByCategory = availableKSIs.reduce((acc, ksi) => {
    const category = ksi.ksi_id.split('-')[1] || 'Unknown';
    if (!acc[category]) acc[category] = [];
    acc[category].push(ksi);
    return acc;
  }, {});

  const triggerValidation = async (type, options = {}) => {
    setIsValidating(true);
    setValidationStatus('Starting validation...');
    
    if (onValidationStarted) onValidationStarted();

    try {
      let response;
      
      switch (type) {
        case 'all':
          response = await ksiService.triggerAllValidations(tenantId);
          setValidationStatus('✅ All validations triggered successfully');
          break;
          
        case 'category':
          response = await ksiService.triggerCategoryValidation(tenantId, options.category);
          setValidationStatus(`✅ ${categories[options.category]} validations triggered`);
          break;
          
        case 'specific':
          response = await ksiService.triggerSpecificKSIs(tenantId, options.ksiIds);
          setValidationStatus(`✅ ${options.ksiIds.length} specific KSI validations triggered`);
          break;
          
        case 'single':
          response = await ksiService.triggerSpecificKSIs(tenantId, [options.ksiId]);
          setValidationStatus(`✅ Validation triggered for ${options.ksiId}`);
          break;
          
        default:
          throw new Error('Unknown validation type');
      }
      
      console.log('Validation response:', response);
      
      if (onValidationCompleted) onValidationCompleted(response);
      
      // Clear status after 5 seconds
      setTimeout(() => {
        setValidationStatus(null);
      }, 5000);
      
    } catch (error) {
      console.error('Validation trigger error:', error);
      setValidationStatus(`❌ Error: ${error.message}`);
      
      // Clear error after 10 seconds
      setTimeout(() => {
        setValidationStatus(null);
      }, 10000);
    } finally {
      setIsValidating(false);
    }
  };

  const handleKSISelection = (ksiId, checked) => {
    if (checked) {
      setSelectedKSIs([...selectedKSIs, ksiId]);
    } else {
      setSelectedKSIs(selectedKSIs.filter(id => id !== ksiId));
    }
  };

  const handleSelectAllInCategory = (category) => {
    const categoryKSIs = ksisByCategory[category] || [];
    const categoryKSIIds = categoryKSIs.map(k => k.ksi_id);
    
    const allSelected = categoryKSIIds.every(id => selectedKSIs.includes(id));
    
    if (allSelected) {
      // Deselect all in category
      setSelectedKSIs(selectedKSIs.filter(id => !categoryKSIIds.includes(id)));
    } else {
      // Select all in category
      const newSelection = [...new Set([...selectedKSIs, ...categoryKSIIds])];
      setSelectedKSIs(newSelection);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">🚀 Trigger KSI Validations</h3>
        <p className="text-gray-600 text-sm">Run compliance validations across your AWS infrastructure</p>
      </div>

      {/* Status Display */}
      {validationStatus && (
        <div className={`mb-4 p-3 rounded-lg ${
          validationStatus.includes('❌') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
        }`}>
          {validationStatus}
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-6">
        <h4 className="font-medium mb-3">Quick Actions</h4>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => triggerValidation('all')}
            disabled={isValidating}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? 'Running...' : 'Run All Validations'}
          </button>
          
          <button
            onClick={() => setShowKSISelector(!showKSISelector)}
            disabled={isValidating}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
          >
            Select Specific KSIs
          </button>
        </div>
      </div>

      {/* Category-based Validation */}
      <div className="mb-6">
        <h4 className="font-medium mb-3">Validate by Category</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(categories).slice(1).map(([key, name]) => {
            const categoryCount = ksisByCategory[key]?.length || 0;
            return (
              <button
                key={key}
                onClick={() => triggerValidation('category', { category: key })}
                disabled={isValidating || categoryCount === 0}
                className="p-3 text-left border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="font-medium text-sm">{key}</div>
                <div className="text-xs text-gray-600">{name}</div>
                <div className="text-xs text-blue-600 mt-1">{categoryCount} KSIs</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* KSI Selector Modal */}
      {showKSISelector && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium">Select KSIs to Validate</h4>
            <button
              onClick={() => setShowKSISelector(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {/* Selected Count */}
          <div className="mb-4">
            <span className="text-sm text-gray-600">
              {selectedKSIs.length} KSIs selected
            </span>
            {selectedKSIs.length > 0 && (
              <button
                onClick={() => triggerValidation('specific', { ksiIds: selectedKSIs })}
                disabled={isValidating}
                className="ml-4 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
              >
                Run Selected ({selectedKSIs.length})
              </button>
            )}
          </div>

          {/* KSI Selection by Category */}
          <div className="max-h-80 overflow-y-auto">
            {Object.entries(ksisByCategory).map(([category, ksis]) => (
              <div key={category} className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-sm">{category} ({ksis.length})</h5>
                  <button
                    onClick={() => handleSelectAllInCategory(category)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {ksis.every(k => selectedKSIs.includes(k.ksi_id)) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                
                <div className="space-y-1 ml-4">
                  {ksis.map(ksi => (
                    <label key={ksi.ksi_id} className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={selectedKSIs.includes(ksi.ksi_id)}
                        onChange={(e) => handleKSISelection(ksi.ksi_id, e.target.checked)}
                        className="mr-2"
                      />
                      <span className="flex-1">{ksi.ksi_id}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {ksi.description || ksi.purpose || 'No description'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Single KSI Trigger Button Component (for use in KSI lists)
export const SingleKSITrigger = ({ ksiId, tenantId = 'tenant-0bf4618d', ksiService, onValidationStarted }) => {
  const [isValidating, setIsValidating] = useState(false);
  const [status, setStatus] = useState(null);

  const triggerSingleKSI = async () => {
    setIsValidating(true);
    if (onValidationStarted) onValidationStarted(ksiId);

    try {
      const response = await ksiService.triggerSpecificKSIs(tenantId, [ksiId]);
      setStatus('✅ Validation triggered');
      console.log(`Validation triggered for ${ksiId}:`, response);
      
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus('❌ Error');
      console.error(`Error triggering validation for ${ksiId}:`, error);
      
      setTimeout(() => setStatus(null), 5000);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={triggerSingleKSI}
        disabled={isValidating}
        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isValidating ? 'Running...' : 'Run Validation →'}
      </button>
      {status && (
        <div className={`text-xs px-2 py-1 rounded ${
          status.includes('❌') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
        }`}>
          {status}
        </div>
      )}
    </div>
  );
};

export default ValidationTriggerComponent;
