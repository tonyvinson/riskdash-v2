/**
 * KSI Service - Enhanced API client with validation execution
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

  // ============================================================================
  // KSI VALIDATION EXECUTION METHODS - NEW!
  // ============================================================================

  async triggerValidation(tenantId, options = {}) {
    return this.apiCall('/api/ksi/validate', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        trigger_source: 'frontend_manual',
        ...options
      })
    });
  }

  async triggerAllValidations(tenantId) {
    return this.apiCall('/api/ksi/validate', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        trigger_source: 'frontend_all_ksis',
        validate_all: true
      })
    });
  }

  async triggerSpecificKSIs(tenantId, ksiIds) {
    return this.apiCall('/api/ksi/validate', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        trigger_source: 'frontend_selective',
        ksi_filter: ksiIds
      })
    });
  }

  async triggerCategoryValidation(tenantId, category) {
    return this.apiCall('/api/ksi/validate', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        trigger_source: 'frontend_category',
        category_filter: category
      })
    });
  }

  async getExecutionHistory(tenantId, limit = 10) {
    return this.apiCall(`/api/ksi/executions?tenant_id=${tenantId}&limit=${limit}`);
  }

  async getValidationResults(tenantId, executionId = null) {
    const endpoint = executionId 
      ? `/api/ksi/results?tenant_id=${tenantId}&execution_id=${executionId}`
      : `/api/ksi/results?tenant_id=${tenantId}`;
    return this.apiCall(endpoint);
  }

  async getLatestValidationSummary(tenantId) {
    return this.apiCall(`/api/ksi/results/summary?tenant_id=${tenantId}`);
  }

  async getKSIExecutionDetails(tenantId, ksiId, executionId = null) {
    const endpoint = executionId
      ? `/api/ksi/results/details?tenant_id=${tenantId}&ksi_id=${ksiId}&execution_id=${executionId}`
      : `/api/ksi/results/details?tenant_id=${tenantId}&ksi_id=${ksiId}`;
    return this.apiCall(endpoint);
  }

  // ============================================================================
  // TENANT AND KSI MANAGEMENT METHODS
  // ============================================================================

  async getAvailableKSIs() {
    return this.apiCall('/api/admin/ksi-defaults');
  }

  async getAllTenants() {
    return this.apiCall('/api/admin/tenants');
  }

  async getTenantDetails(tenantId) {
    return this.apiCall(`/api/admin/tenants/${tenantId}`);
  }

  async getTenantDashboard(tenantId) {
    return this.apiCall(`/api/tenant/${tenantId}/dashboard`);
  }

  async updateTenantKSIConfiguration(tenantId, ksiConfig) {
    return this.apiCall(`/api/admin/tenants/${tenantId}/ksi-config`, {
      method: 'PUT',
      body: JSON.stringify(ksiConfig)
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async healthCheck() {
    return this.apiCall('/api/health');
  }

  async getSystemStatus() {
    return this.apiCall('/api/admin/system/status');
  }

  // Format validation results for display
  formatValidationResults(results) {
    if (!results || !Array.isArray(results)) return [];
    
    return results.map(result => ({
      ...result,
      statusColor: result.assertion ? 'green' : 'red',
      statusText: result.assertion ? 'PASS' : 'FAIL',
      successRate: result.commands_executed > 0 
        ? Math.round((result.successful_commands / result.commands_executed) * 100)
        : 0,
      formattedTimestamp: new Date(result.timestamp).toLocaleString()
    }));
  }

  // Group results by category
  groupResultsByCategory(results) {
    if (!results || !Array.isArray(results)) return {};
    
    return results.reduce((groups, result) => {
      const category = result.category || 'Unknown';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(result);
      return groups;
    }, {});
  }

  // Calculate summary statistics
  calculateSummaryStats(results) {
    if (!results || !Array.isArray(results)) {
      return { total: 0, passed: 0, failed: 0, passRate: 0 };
    }
    
    const total = results.length;
    const passed = results.filter(r => r.assertion).length;
    const failed = total - passed;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    return { total, passed, failed, passRate };
  }
}

const ksiService = new KSIService();
export default ksiService;
