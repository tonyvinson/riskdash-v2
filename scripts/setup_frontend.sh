#!/bin/bash
set -e

echo "🚀 SETTING UP COMPLETE KSI VALIDATOR FRONTEND"
echo "=============================================="

# Navigate to frontend directory
cd frontend

echo "📦 Step 1: Creating package.json..."
cat > package.json << 'EOF'
{
  "name": "ksi-validator-frontend",
  "version": "1.0.0",
  "description": "React frontend for KSI Validator with 7-step onboarding",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "lucide-react": "^0.263.1",
    "axios": "^1.6.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "devDependencies": {
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
EOF

echo "📁 Step 2: Creating directory structure..."
mkdir -p public
mkdir -p src/components/TenantOnboarding
mkdir -p src/components/KSIManager
mkdir -p src/services

echo "🌐 Step 3: Creating public/index.html..."
cat > public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="KSI Validator - FedRAMP 20x Compliance Onboarding" />
    <title>🛡️ KSI Validator - Tenant Onboarding</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
EOF

echo "⚛️ Step 4: Creating src/index.js..."
cat > src/index.js << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

echo "🎨 Step 5: Creating src/index.css with Tailwind..."
cat > src/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}

/* Custom styles for KSI Validator */
.progress-step {
  @apply flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all duration-200;
}

.progress-step.active {
  @apply bg-blue-600 text-white;
}

.progress-step.completed {
  @apply bg-green-600 text-white;
}

.progress-step.pending {
  @apply bg-gray-300 text-gray-600;
}

.card {
  @apply bg-white border border-gray-200 rounded-lg shadow-sm;
}

.btn-primary {
  @apply bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200;
}

.btn-secondary {
  @apply bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors duration-200;
}

.input-field {
  @apply w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
}

.label {
  @apply block text-sm font-medium text-gray-700 mb-2;
}
EOF

echo "🔧 Step 6: Creating Tailwind config..."
cat > tailwind.config.js << 'EOF'
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        }
      }
    },
  },
  plugins: [],
}
EOF

cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

echo "🔌 Step 7: Creating API service (ksiService.js)..."
cat > src/services/ksiService.js << 'EOF'
/**
 * KSI Service - API client for Enhanced Lambda with 7-step onboarding
 * Connects React frontend to your deployed Lambda function
 */

const API_BASE_URL = 'https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev';

class KSIService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async apiCall(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      console.log(`API Call: ${config.method || 'GET'} ${url}`);
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log(`API Response:`, data);
      return data;
    } catch (error) {
      console.error(`API Error for ${url}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // 7-STEP ONBOARDING API METHODS
  // ============================================================================

  async startOnboarding(organizationData) {
    return this.apiCall('/api/admin/onboarding/start', {
      method: 'POST',
      body: JSON.stringify({
        organization: organizationData,
        created_by: 'frontend-user'
      })
    });
  }

  async updateOnboardingStep(tenantId, stepNumber, stepData) {
    return this.apiCall(`/api/admin/onboarding/${tenantId}/step`, {
      method: 'PUT',
      body: JSON.stringify({
        step: stepNumber,
        data: stepData
      })
    });
  }

  async getOnboardingStatus(tenantId) {
    return this.apiCall(`/api/admin/onboarding/${tenantId}/step`);
  }

  async generateIAMRoleInstructions(tenantId) {
    return this.apiCall(`/api/admin/onboarding/${tenantId}/iam-instructions`);
  }

  async testCrossAccountConnection(tenantId) {
    return this.apiCall(`/api/admin/onboarding/${tenantId}/test-connection`, {
      method: 'POST'
    });
  }

  async completeOnboarding(tenantId) {
    return this.apiCall(`/api/admin/onboarding/${tenantId}/complete`, {
      method: 'POST'
    });
  }

  // KSI and tenant methods
  async getAvailableKSIs() {
    return this.apiCall('/api/admin/ksi-defaults');
  }

  async getAllTenants() {
    return this.apiCall('/api/admin/tenants');
  }

  async getTenantDashboard(tenantId) {
    return this.apiCall(`/api/tenant/${tenantId}/dashboard`);
  }
}

const ksiService = new KSIService();
export default ksiService;
EOF

echo "📋 Step 8: Creating main App.js..."
cat > src/App.js << 'EOF'
import React, { useState } from 'react';
import TenantOnboarding from './components/TenantOnboarding/TenantOnboarding';
import KSIManager from './components/KSIManager/KSIManager';
import './index.css';

function App() {
  const [currentView, setCurrentView] = useState('onboarding');
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleOnboardingComplete = (result) => {
    showNotification(`🎉 Tenant onboarded successfully! ID: ${result.tenant_id}`);
    setCurrentView('dashboard');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'onboarding':
        return <TenantOnboarding onComplete={handleOnboardingComplete} />;
      case 'dashboard':
        return <KSIManager />;
      default:
        return <TenantOnboarding onComplete={handleOnboardingComplete} />;
    }
  };

  return (
    <div className="App min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                🛡️ KSI Validator - Onboarding Platform
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentView('onboarding')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentView === 'onboarding'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                🏢 New Tenant
              </button>
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentView === 'dashboard'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                📊 Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 max-w-sm p-4 rounded-md shadow-lg z-50 ${
          notification.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6">
        {renderCurrentView()}
      </main>
    </div>
  );
}

export default App;
EOF

echo "🏢 Step 9: Creating TenantOnboarding component..."
cat > src/components/TenantOnboarding/TenantOnboarding.js << 'EOF'
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle, AlertCircle, Copy, ExternalLink, Upload } from 'lucide-react';
import ksiService from '../../services/ksiService';

const TenantOnboarding = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [tenantId, setTenantId] = useState(null);
  const [formData, setFormData] = useState({
    organization: {},
    contacts: { primary: {}, technical: {}, billing: {} },
    awsAccounts: {},
    compliance: {},
    preferences: {}
  });
  const [roleInstructions, setRoleInstructions] = useState(null);
  const [connectionTest, setConnectionTest] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [stepErrors, setStepErrors] = useState({});

  const steps = [
    { id: 1, title: 'Organization Info', description: 'Basic organization details' },
    { id: 2, title: 'Contact Information', description: 'Primary and technical contacts' },
    { id: 3, title: 'AWS Configuration', description: 'AWS account setup' },
    { id: 4, title: 'AWS IAM Role', description: 'Cross-account access setup' },
    { id: 5, title: 'Compliance Profile', description: 'FedRAMP and compliance settings' },
    { id: 6, title: 'Preferences', description: 'Validation and notification settings' },
    { id: 7, title: 'Review & Submit', description: 'Final review and activation' }
  ];

  const updateFormData = (section, data) => {
    setFormData(prev => ({
      ...prev,
      [section]: { ...prev[section], ...data }
    }));
    // Clear errors for this section
    setStepErrors(prev => ({ ...prev, [currentStep]: null }));
  };

  const validateCurrentStep = () => {
    let error = null;
    
    switch (currentStep) {
      case 1:
        if (!formData.organization.name) error = 'Organization name is required';
        else if (!formData.organization.type) error = 'Organization type is required';
        break;
      case 2:
        if (!formData.contacts.primary.email) error = 'Primary contact email is required';
        else if (!formData.contacts.primary.name) error = 'Primary contact name is required';
        break;
      case 3:
        if (!formData.awsAccounts.primaryAccountId) error = 'AWS Account ID is required';
        else if (!/^\d{12}$/.test(formData.awsAccounts.primaryAccountId)) error = 'AWS Account ID must be 12 digits';
        break;
      case 4:
        if (!formData.awsAccounts.crossAccountRoleArn) error = 'Cross-account role ARN is required';
        break;
      case 5:
        if (!formData.compliance.fedrampLevel) error = 'FedRAMP level is required';
        break;
      case 6:
        if (!formData.preferences.notificationEmail) error = 'Notification email is required';
        break;
    }

    if (error) {
      setStepErrors(prev => ({ ...prev, [currentStep]: error }));
      return false;
    }
    return true;
  };

  const nextStep = async () => {
    if (!validateCurrentStep()) return;

    setIsSubmitting(true);
    try {
      if (currentStep === 1 && !tenantId) {
        // Start onboarding process
        const result = await ksiService.startOnboarding(formData.organization);
        setTenantId(result.tenant_id);
      } else if (tenantId) {
        // Update current step
        const sectionMap = {
          1: 'organization',
          2: 'contacts', 
          3: 'awsAccounts',
          4: 'awsAccounts',
          5: 'compliance',
          6: 'preferences'
        };
        
        const section = sectionMap[currentStep];
        if (section) {
          await ksiService.updateOnboardingStep(tenantId, currentStep, formData[section]);
        }
      }

      setCurrentStep(currentStep + 1);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    setIsSubmitting(false);
  };

  const generateRoleInstructions = async () => {
    if (!tenantId) return;
    
    try {
      const instructions = await ksiService.generateIAMRoleInstructions(tenantId);
      setRoleInstructions(instructions);
    } catch (err) {
      setError(err.message);
    }
  };

  const testConnection = async () => {
    if (!tenantId) return;
    
    setIsSubmitting(true);
    try {
      const result = await ksiService.testCrossAccountConnection(tenantId);
      setConnectionTest(result);
      if (result.status === 'success') {
        setCurrentStep(5); // Move to compliance step
      }
    } catch (err) {
      setConnectionTest({ status: 'failed', error: err.message });
    }
    setIsSubmitting(false);
  };

  const submitOnboarding = async () => {
    setIsSubmitting(true);
    try {
      const result = await ksiService.completeOnboarding(tenantId);
      onComplete(result);
    } catch (err) {
      setError(err.message);
    }
    setIsSubmitting(false);
  };

  // Step rendering functions
  const renderStep1 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Organization Information</h3>
      
      <div>
        <label className="label">Organization Name *</label>
        <input
          type="text"
          className="input-field"
          value={formData.organization.name || ''}
          onChange={(e) => updateFormData('organization', { name: e.target.value })}
          placeholder="Acme Corporation"
        />
      </div>

      <div>
        <label className="label">Organization Type *</label>
        <select
          className="input-field"
          value={formData.organization.type || ''}
          onChange={(e) => updateFormData('organization', { type: e.target.value })}
        >
          <option value="">Select type...</option>
          <option value="federal_agency">Federal Agency</option>
          <option value="contractor">Government Contractor</option>
          <option value="state_local">State/Local Government</option>
          <option value="private">Private Sector</option>
        </select>
      </div>

      <div>
        <label className="label">Industry</label>
        <select
          className="input-field"
          value={formData.organization.industry || ''}
          onChange={(e) => updateFormData('organization', { industry: e.target.value })}
        >
          <option value="">Select industry...</option>
          <option value="defense">Defense</option>
          <option value="healthcare">Healthcare</option>
          <option value="finance">Financial Services</option>
          <option value="technology">Technology</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Primary Contact Name *</label>
          <input
            type="text"
            className="input-field"
            value={formData.contacts.primary.name || ''}
            onChange={(e) => updateFormData('contacts', { 
              primary: { ...formData.contacts.primary, name: e.target.value }
            })}
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="label">Primary Contact Email *</label>
          <input
            type="email"
            className="input-field"
            value={formData.contacts.primary.email || ''}
            onChange={(e) => updateFormData('contacts', { 
              primary: { ...formData.contacts.primary, email: e.target.value }
            })}
            placeholder="john.doe@company.gov"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Technical Contact Name</label>
          <input
            type="text"
            className="input-field"
            value={formData.contacts.technical.name || ''}
            onChange={(e) => updateFormData('contacts', { 
              technical: { ...formData.contacts.technical, name: e.target.value }
            })}
            placeholder="Jane Smith"
          />
        </div>

        <div>
          <label className="label">Technical Contact Email</label>
          <input
            type="email"
            className="input-field"
            value={formData.contacts.technical.email || ''}
            onChange={(e) => updateFormData('contacts', { 
              technical: { ...formData.contacts.technical, email: e.target.value }
            })}
            placeholder="jane.smith@company.gov"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">AWS Configuration</h3>
      
      <div>
        <label className="label">Primary AWS Account ID *</label>
        <input
          type="text"
          className="input-field"
          value={formData.awsAccounts.primaryAccountId || ''}
          onChange={(e) => updateFormData('awsAccounts', { primaryAccountId: e.target.value })}
          placeholder="123456789012"
          maxLength="12"
        />
        <p className="text-sm text-gray-500 mt-1">12-digit AWS account ID</p>
      </div>

      <div>
        <label className="label">Primary Region</label>
        <select
          className="input-field"
          value={formData.awsAccounts.primaryRegion || 'us-gov-west-1'}
          onChange={(e) => updateFormData('awsAccounts', { primaryRegion: e.target.value })}
        >
          <option value="us-gov-west-1">US Gov West 1 (Oregon)</option>
          <option value="us-gov-east-1">US Gov East 1 (Virginia)</option>
        </select>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">AWS IAM Role Setup</h3>
      
      {!roleInstructions && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-blue-700 mb-4">Generate deployment instructions for the required IAM role.</p>
          <button
            onClick={generateRoleInstructions}
            className="btn-primary"
          >
            Generate IAM Role Instructions
          </button>
        </div>
      )}

      {roleInstructions && (
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <h4 className="font-medium mb-2">External ID</h4>
            <div className="flex items-center space-x-2">
              <code className="bg-white px-2 py-1 rounded text-sm font-mono">
                {roleInstructions.external_id}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(roleInstructions.external_id)}
                className="text-blue-600 hover:text-blue-800"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="label">Cross-Account Role ARN *</label>
            <input
              type="text"
              className="input-field"
              value={formData.awsAccounts.crossAccountRoleArn || ''}
              onChange={(e) => updateFormData('awsAccounts', { crossAccountRoleArn: e.target.value })}
              placeholder="arn:aws-us-gov:iam::123456789012:role/KSIValidationRole"
            />
          </div>

          {formData.awsAccounts.crossAccountRoleArn && (
            <div>
              <button
                onClick={testConnection}
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          )}

          {connectionTest && (
            <div className={`p-4 rounded-md ${
              connectionTest.status === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              <h4 className="font-medium">Connection Test Result</h4>
              <p>{connectionTest.message || connectionTest.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Compliance Profile</h3>
      
      <div>
        <label className="label">FedRAMP Level *</label>
        <select
          className="input-field"
          value={formData.compliance.fedrampLevel || ''}
          onChange={(e) => updateFormData('compliance', { fedrampLevel: e.target.value })}
        >
          <option value="">Select FedRAMP level...</option>
          <option value="Low">FedRAMP Low</option>
          <option value="Moderate">FedRAMP Moderate</option>
          <option value="High">FedRAMP High</option>
        </select>
      </div>

      <div>
        <label className="label">Current Status</label>
        <select
          className="input-field"
          value={formData.compliance.currentStatus || ''}
          onChange={(e) => updateFormData('compliance', { currentStatus: e.target.value })}
        >
          <option value="">Select current status...</option>
          <option value="planning">Planning Phase</option>
          <option value="implementation">Implementation</option>
          <option value="assessment">Assessment & Authorization</option>
          <option value="authorized">Authorized</option>
        </select>
      </div>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Validation Preferences</h3>
      
      <div>
        <label className="label">Notification Email *</label>
        <input
          type="email"
          className="input-field"
          value={formData.preferences.notificationEmail || ''}
          onChange={(e) => updateFormData('preferences', { notificationEmail: e.target.value })}
          placeholder="notifications@company.gov"
        />
      </div>

      <div>
        <label className="label">Validation Frequency</label>
        <select
          className="input-field"
          value={formData.preferences.validationFrequency || 'daily'}
          onChange={(e) => updateFormData('preferences', { validationFrequency: e.target.value })}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
    </div>
  );

  const renderStep7 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Review & Submit</h3>
      
      <div className="bg-gray-50 rounded-md p-4 space-y-4">
        <div>
          <h4 className="font-medium">Organization</h4>
          <p className="text-sm text-gray-600">{formData.organization.name} ({formData.organization.type})</p>
        </div>
        <div>
          <h4 className="font-medium">AWS Account</h4>
          <p className="text-sm text-gray-600">{formData.awsAccounts.primaryAccountId} - {formData.awsAccounts.primaryRegion}</p>
        </div>
        <div>
          <h4 className="font-medium">Compliance</h4>
          <p className="text-sm text-gray-600">FedRAMP {formData.compliance.fedrampLevel} - {formData.compliance.currentStatus}</p>
        </div>
        <div>
          <h4 className="font-medium">Validation</h4>
          <p className="text-sm text-gray-600">{formData.preferences.validationFrequency} validations to {formData.preferences.notificationEmail}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <h4 className="font-medium mb-2">🚀 Next Steps</h4>
        <ol className="text-sm text-gray-600 space-y-1">
          <li>1. Your tenant account will be created</li>
          <li>2. Initial KSI validation will begin within 1 hour</li>
          <li>3. You'll receive a welcome email with dashboard access</li>
          <li>4. Compliance reports will be available immediately</li>
        </ol>
      </div>

      <button
        onClick={submitOnboarding}
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white py-3 rounded-md disabled:bg-gray-400"
      >
        {isSubmitting ? 'Creating Your Account...' : 'Complete Onboarding'}
      </button>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      case 7: return renderStep7();
      default: return renderStep1();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🛡️ KSI Validator Onboarding
        </h1>
        <p className="text-gray-600">
          Set up your organization for automated FedRAMP 20x compliance validation
        </p>
        {tenantId && (
          <p className="text-sm text-blue-600 mt-2">Tenant ID: {tenantId}</p>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="text-red-400 mr-2" size={20} />
            <div className="text-red-700 text-sm">{error}</div>
          </div>
        </div>
      )}

      {stepErrors[currentStep] && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="text-yellow-400 mr-2" size={20} />
            <div className="text-yellow-700 text-sm">{stepErrors[currentStep]}</div>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`progress-step ${
                currentStep === step.id 
                  ? 'active' 
                  : currentStep > step.id 
                    ? 'completed' 
                    : 'pending'
              }`}>
                {currentStep > step.id ? <CheckCircle size={16} /> : step.id}
              </div>
              <div className="ml-2 hidden md:block">
                <div className="text-sm font-medium">{step.title}</div>
                <div className="text-xs text-gray-500">{step.description}</div>
              </div>
              {index < steps.length - 1 && (
                <ChevronRight className="mx-4 text-gray-400" size={16} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="card p-6 mb-6">
        {renderCurrentStep()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
        >
          <ChevronLeft size={16} className="mr-1" />
          Previous
        </button>
        
        {currentStep < 7 && (
          <button
            onClick={nextStep}
            disabled={isSubmitting}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400"
          >
            {isSubmitting ? 'Processing...' : 'Next'}
            <ChevronRight size={16} className="ml-1" />
          </button>
        )}
      </div>
    </div>
  );
};

export default TenantOnboarding;
EOF

echo "📊 Step 10: Creating KSIManager component..."
cat > src/components/KSIManager/KSIManager.js << 'EOF'
import React, { useState, useEffect } from 'react';
import { Shield, Users, Activity, Settings } from 'lucide-react';
import ksiService from '../../services/ksiService';

const KSIManager = () => {
  const [tenants, setTenants] = useState([]);
  const [availableKSIs, setAvailableKSIs] = useState([]);
  const [loading, setLoading] = useState(true);

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
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        📊 KSI Validator Dashboard
      </h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              <p className="text-2xl font-bold text-purple-600">
                {tenants.filter(t => t.status === 'active').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Available KSIs */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Available KSIs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableKSIs.map((ksi) => (
            <div key={ksi.ksi_id} className="card p-4">
              <h3 className="font-semibold text-blue-600">{ksi.ksi_id}</h3>
              <h4 className="font-medium text-gray-900">{ksi.title}</h4>
              <p className="text-sm text-gray-600 mb-2">{ksi.description}</p>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Category: {ksi.category}</span>
                <span>Commands: {ksi.command_count}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default KSIManager;
EOF

echo "📦 Step 11: Installing dependencies..."
npm install

echo "🎉 FRONTEND SETUP COMPLETE!"
echo "================================="
echo ""
echo "✅ React app created with:"
echo "   - 7-step tenant onboarding workflow"
echo "   - Connected to your Lambda API: hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com"
echo "   - Tailwind CSS styling"
echo "   - Complete form validation"
echo "   - IAM role instructions generation"
echo "   - Cross-account connection testing"
echo ""
echo "🚀 To start testing:"
echo "   cd frontend"
echo "   npm start"
echo ""
echo "📱 App will open at: http://localhost:3000"
echo "🏢 Click 'New Tenant' to test your 7-step onboarding!"
echo ""
echo "🎯 Ready to test your sophisticated onboarding workflow!"
EOF
