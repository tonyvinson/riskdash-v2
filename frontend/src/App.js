import React, { useState } from 'react';
import { Shield, Users, Plus, BarChart3, Settings, Home } from 'lucide-react';
import KSIManager from './components/KSIManager/KSIManager';
import DualDashboard from './components/DualDashboard';
import TenantOnboarding from './components/TenantOnboarding/TenantOnboarding';
import RealKSIManagement from './components/RealKSIManagement/RealKSIManagement'; // NEW IMPORT
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [notification, setNotification] = useState(null);

  const handleOnboardingComplete = (result) => {
    console.log('Onboarding completed:', result);
    setCurrentView('dashboard');
    showNotification(`Tenant onboarding completed successfully! Tenant ID: ${result.tenant_id}`, 'success');
  };

  const handleKSIConfigurationSaved = (result) => {
    console.log('KSI configuration saved:', result);
    showNotification(`KSI configuration updated successfully! ${result.enabled_ksis} KSIs enabled.`, 'success');
    // Don't switch views - stay in KSI management
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'onboarding':
        return (
          <TenantOnboarding 
            onComplete={handleOnboardingComplete}
          />
        );
      case 'ksi-management':
        return (
          <RealKSIManagement 
            onConfigurationSaved={handleKSIConfigurationSaved}
            onNotification={showNotification}
          />
        );
      case 'dashboard':
        return <DualDashboard onNotification={showNotification} />;
      default:
        return <DualDashboard onNotification={showNotification} />;
    }
  };

  // Enhanced header content for all three views
  const getHeaderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return {
          title: "FedRAMP 20x Dashboard",
          subtitle: "Real-time Compliance Validation & Trust Center",
          icon: "🛡️"
        };
      case 'ksi-management':
        return {
          title: "KSI Management Portal",
          subtitle: "Configure Key Security Indicators & Validation Rules",
          icon: "⚙️"
        };
      case 'onboarding':
        return {
          title: "Tenant Onboarding",
          subtitle: "Enterprise FedRAMP 20X Compliance Setup",
          icon: "🏢"
        };
      default:
        return {
          title: "KSI Validator Platform",
          subtitle: "Enterprise FedRAMP 20X Compliance Validation",
          icon: "🛡️"
        };
    }
  };

  const headerContent = getHeaderContent();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Navigation */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Dynamic Logo and Title */}
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <span className="text-lg">{headerContent.icon}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {headerContent.title}
                </h1>
                <p className="text-sm text-gray-500">
                  {headerContent.subtitle}
                </p>
              </div>
            </div>

            {/* Enhanced Navigation with KSI Management */}
            <nav className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  currentView === 'dashboard'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <BarChart3 size={16} />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setCurrentView('ksi-management')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  currentView === 'ksi-management'
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Settings size={16} />
                <span>KSI Management</span>
              </button>

              <button
                onClick={() => setCurrentView('onboarding')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  currentView === 'onboarding'
                    ? 'bg-green-100 text-green-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Plus size={16} />
                <span>New Tenant</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Notification System */}
      {notification && (
        <div className={`fixed top-20 right-4 max-w-md p-4 rounded-md shadow-lg z-50 border ${
          notification.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-700'
            : notification.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {notification.type === 'success' && <span className="text-green-400">✅</span>}
              {notification.type === 'error' && <span className="text-red-400">❌</span>}
              {notification.type === 'info' && <span className="text-blue-400">ℹ️</span>}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setNotification(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="min-h-screen">
        {renderCurrentView()}
      </main>

      {/* Enhanced Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                🛡️ KSI Validator Platform
              </h3>
              <p className="text-gray-600 text-sm">
                Enterprise-grade FedRAMP 20X compliance validation platform 
                with sophisticated tenant onboarding, KSI management, and real-time validation execution.
              </p>
            </div>
            
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">Platform Features</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>✅ 7-Step Enterprise Onboarding</li>
                <li>✅ Dynamic KSI Configuration Management</li>
                <li>✅ 51 Comprehensive KSIs</li>
                <li>✅ Cross-Account Validation</li>
                <li>✅ Real-time Results Dashboard</li>
                <li>✅ Auto-generated IAM Deployment</li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">Compliance Coverage</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>🔐 Cryptographic Evidence & Documentation</li>
                <li>⚙️ Configuration Management & Tracking</li>
                <li>🌐 Network Architecture & Security</li>
                <li>👤 Identity & Access Management</li>
                <li>📊 Monitoring, Logging & Alerting</li>
                <li>📋 Policy & Inventory Management</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-200 mt-8 pt-6 text-center text-sm text-gray-500">
            <p>Built with enterprise-grade security for FedRAMP 20X compliance validation</p>
            <p className="mt-1">Real DynamoDB integration • {currentView === 'ksi-management' ? 'KSI Management Active' : 'Dashboard Mode'}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
