import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#ff2d6d', textAlign: 'center', marginTop: '20vh' }}>
          <h3>Globe Rendering Error</h3>
          <p style={{ color: '#9ca3af', fontSize: 13 }}>
            The WebGL context crashed (often caused by hot-reloading).<br/>
            Please <strong>refresh</strong> the page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
