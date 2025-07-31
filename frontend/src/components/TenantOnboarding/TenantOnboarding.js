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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
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
        <div className="space-y-6">
          {/* External ID */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <h4 className="font-medium mb-2">🔑 External ID</h4>
            <div className="flex items-center space-x-2">
              <code className="bg-white px-3 py-2 rounded text-sm font-mono border">
                {roleInstructions.external_id}
              </code>
              <button
                onClick={() => copyToClipboard(roleInstructions.external_id)}
                className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                title="Copy to clipboard"
              >
                <Copy size={16} />
                <span className="text-sm">Copy</span>
              </button>
            </div>
          </div>

          {/* AWS CLI Deployment */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="font-medium mb-3 flex items-center">
              🚀 AWS CLI Deployment Commands
              <span className="ml-2 text-xs bg-blue-200 px-2 py-1 rounded">Recommended</span>
            </h4>
            <p className="text-sm text-blue-700 mb-4">Run these commands in your AWS account to create the required IAM role:</p>
            
            {roleInstructions.deployment_methods?.aws_cli?.steps?.map((step, index) => (
              <div key={index} className="mb-4">
                <div className="text-sm font-medium text-blue-800 mb-2">
                  Step {step.step}: {step.description}
                </div>
                <div className="relative">
                  <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
                    {step.command}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(step.command)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                    title="Copy command"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* CloudFormation Template */}
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <h4 className="font-medium mb-3 flex items-center justify-between">
              ☁️ CloudFormation Template
              <button
                onClick={() => copyToClipboard(roleInstructions.deployment_methods?.cloudformation?.template)}
                className="text-green-600 hover:text-green-800 flex items-center space-x-1 text-sm"
              >
                <Copy size={14} />
                <span>Copy Template</span>
              </button>
            </h4>
            <textarea
              className="w-full h-40 bg-gray-900 text-green-400 p-3 rounded text-xs font-mono"
              readOnly
              value={roleInstructions.deployment_methods?.cloudformation?.template || ''}
            />
          </div>

          {/* Terraform Template */}
          <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
            <h4 className="font-medium mb-3 flex items-center justify-between">
              🏗️ Terraform Template
              <button
                onClick={() => copyToClipboard(roleInstructions.deployment_methods?.terraform?.template)}
                className="text-purple-600 hover:text-purple-800 flex items-center space-x-1 text-sm"
              >
                <Copy size={14} />
                <span>Copy Template</span>
              </button>
            </h4>
            <textarea
              className="w-full h-40 bg-gray-900 text-purple-400 p-3 rounded text-xs font-mono"
              readOnly
              value={roleInstructions.deployment_methods?.terraform?.template || ''}
            />
          </div>

          {/* Expected Role ARN */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <h4 className="font-medium mb-2">📋 Expected Role ARN</h4>
            <code className="text-sm bg-white px-3 py-2 rounded border block">
              {roleInstructions.expected_role_arn}
            </code>
            <p className="text-xs text-yellow-700 mt-2">
              This is the ARN your role should have after creation. Copy this for the next step.
            </p>
          </div>

          {/* Role ARN Input */}
          <div>
            <label className="label">Cross-Account Role ARN *</label>
            <input
              type="text"
              className="input-field"
              value={formData.awsAccounts.crossAccountRoleArn || ''}
              onChange={(e) => updateFormData('awsAccounts', { crossAccountRoleArn: e.target.value })}
              placeholder={roleInstructions.expected_role_arn}
            />
            <p className="text-sm text-gray-500 mt-1">
              Paste the ARN of the IAM role you created using the instructions above.
            </p>
          </div>

          {/* Connection Test */}
          {formData.awsAccounts.crossAccountRoleArn && (
            <div className="border-t pt-4">
              <button
                onClick={testConnection}
                disabled={isSubmitting}
                className="btn-primary w-full flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Testing Connection...</span>
                  </>
                ) : (
                  <>
                    <span>🔧 Test Cross-Account Connection</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Connection Test Results */}
          {connectionTest && (
            <div className={`p-4 rounded-md ${
              connectionTest.status === 'success' 
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              <h4 className={`font-medium ${
                connectionTest.status === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {connectionTest.status === 'success' ? '✅ Connection Test Successful!' : '❌ Connection Test Failed'}
              </h4>
              <p className={`text-sm mt-1 ${
                connectionTest.status === 'success' ? 'text-green-700' : 'text-red-700'
              }`}>
                {connectionTest.message || connectionTest.error}
              </p>
              
              {connectionTest.test_results && (
                <div className="mt-3 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className={`p-2 rounded ${
                      connectionTest.test_results.role_assumption === 'success' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      Role Assumption: {connectionTest.test_results.role_assumption}
                    </div>
                    <div className={`p-2 rounded ${
                      connectionTest.test_results.api_access === 'success' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      API Access: {connectionTest.test_results.api_access}
                    </div>
                    <div className={`p-2 rounded ${
                      connectionTest.test_results.permissions_verified === 'success' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      Permissions: {connectionTest.test_results.permissions_verified}
                    </div>
                  </div>
                </div>
              )}
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
