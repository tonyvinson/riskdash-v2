import React, { useState } from 'react';
import { Shield, Users, Plus, BarChart3, Settings, Home } from 'lucide-react';
import KSIManager from './components/KSIManager/KSIManager';
import DualDashboard from './components/DualDashboard'; // ← NEW IMPORT
import TenantOnboarding from './components/TenantOnboarding/TenantOnboarding';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  const handleOnboardingComplete = (result) => {
    console.log('Onboarding completed:', result);
    // Switch back to dashboard after successful onboarding
    setCurrentView('dashboard');
    // Show success message
    alert(`Tenant onboarding completed successfully! Tenant ID: ${result.tenant_id}`);
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'onboarding':
        return (
          <TenantOnboarding 
            onComplete={handleOnboardingComplete}
          />
        );
      case 'dashboard':
        return <DualDashboard />; // ← CHANGED FROM <KSIManager />
      default:
        return <DualDashboard />; // ← CHANGED FROM <KSIManager />
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Navigation */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Title */}
            <div className="flex items-center space-x-3">
              <Shield className="text-blue-600" size={32} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  KSI Validator - Onboarding Platform
                </h1>
                <p className="text-sm text-gray-500">
                  Enterprise FedRAMP 20X Compliance Validation
                </p>
              </div>
            </div>

            {/* Navigation */}
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

      {/* Main Content */}
      <main className="min-h-screen">
        {renderCurrentView()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                🛡️ KSI Validator Platform
              </h3>
              <p className="text-gray-600 text-sm">
                Enterprise-grade FedRAMP 20X compliance validation platform 
                with sophisticated tenant onboarding and real-time validation execution.
              </p>
            </div>
            
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">Platform Features</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>✅ 7-Step Enterprise Onboarding</li>
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
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-200 mt-8 pt-6 text-center text-sm text-gray-500">
            <p>Built with enterprise-grade security for FedRAMP 20X compliance validation</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
