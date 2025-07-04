export interface Env {
  BACKEND_URL: string;
  ALLOWED_ORIGIN: string;
  TARGET_IFRAME_URL: string;
}

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wallet Integration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            font-weight: 500;
        }
        .status.success {
            background-color: #d4edda;
            color: #155724;
        }
        .status.error {
            background-color: #f8d7da;
            color: #721c24;
        }
        .status.info {
            background-color: #cce5ff;
            color: #004085;
        }
        iframe {
            width: 100%;
            height: 500px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin: 20px 0;
        }
        button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #0056b3;
        }
        button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Wallet Integration</h1>
        <div id="status" class="status info">Click the button below to start authentication</div>
        
        <button id="authButton" onclick="startAuth()">Start Authentication</button>
        
        <div id="iframeContainer" class="hidden">
            <iframe id="authFrame" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
        </div>
        
        <div id="authData" class="hidden">
            <h2>Authentication Data</h2>
            <pre id="authDataContent"></pre>
            
            <h3>GraphQL Query</h3>
            <textarea id="graphqlQuery" rows="12" cols="70" placeholder="Enter your GraphQL query here...">
query wallets($walletIds: [String!]!) {
  wallets(walletIds: $walletIds) {
    ...wallet
  }
}

fragment wallet on Wallet {
  id
  address
  hasBeenExported
  importedFromExternal
  isSecurityWeak
}</textarea>
            <br><br>
            
            <h3>Variables (JSON)</h3>
            <textarea id="graphqlVariables" rows="4" cols="70" placeholder="Enter variables as JSON (optional)...">{"walletIds": []}</textarea>
            <br><br>
            
            <button onclick="testGraphQLAPI()">Execute GraphQL Query</button>
            <button onclick="clearStoredData()" style="margin-left: 10px; background-color: #dc3545;">Clear Stored Data</button>
            
            <div id="graphqlResponse" class="hidden">
                <h3>GraphQL Response</h3>
                <pre id="graphqlResponseContent"></pre>
            </div>
        </div>
    </div>

    <script>
        const IFRAME_URL = '{{TARGET_IFRAME_URL}}';
        const BACKEND_URL = '{{BACKEND_URL}}';
        const ALLOWED_ORIGIN = '{{ALLOWED_ORIGIN}}';
        const STORAGE_KEY = 'identity_key_manager';
        
        let identityData = null;
        
        function updateStatus(message, type = 'info') {
            const statusEl = document.getElementById('status');
            statusEl.textContent = message;
            statusEl.className = 'status ' + type;
        }
        
        function startAuth() {
            updateStatus('Loading authentication iframe...', 'info');
            document.getElementById('authButton').disabled = true;
            document.getElementById('iframeContainer').classList.remove('hidden');
            
            const iframe = document.getElementById('authFrame');
            iframe.src = IFRAME_URL;
        }
        
        function isAuthSuccessMessage(message) {
            return (
                typeof message === 'object' &&
                message !== null &&
                'type' in message &&
                'data' in message &&
                message.type === 'AUTH_SUCCESS' &&
                typeof message.data === 'object' &&
                message.data !== null &&
                'identityAndKeyManager' in message.data
            );
        }
        
        function isRequestParentOriginMessage(message) {
            return (
                typeof message === 'object' &&
                message !== null &&
                'type' in message &&
                message.type === 'REQUEST_PARENT_ORIGIN'
            );
        }
        
        function isValidIdentityAndKeyManager(data) {
            return (
                typeof data === 'object' &&
                data !== null &&
                'hashedIdentity' in data &&
                'hashedSeedUpdatedAt' in data &&
                typeof data.hashedIdentity === 'string' &&
                typeof data.hashedSeedUpdatedAt === 'string'
            );
        }
        
        function saveToLocalStorage(identityAndKeyManager) {
            try {
                const serialized = JSON.stringify(identityAndKeyManager);
                localStorage.setItem(STORAGE_KEY, serialized);
                return true;
            } catch (error) {
                console.error('Failed to save identity key manager to localStorage:', error);
                return false;
            }
        }
        
        function loadFromLocalStorage() {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (!stored) return null;
                
                const parsed = JSON.parse(stored);
                return isValidIdentityAndKeyManager(parsed) ? parsed : null;
            } catch (error) {
                console.error('Failed to load identity key manager from localStorage:', error);
                return null;
            }
        }
        
        window.addEventListener('message', async (event) => {
            console.log('Received postMessage:', event.data);
            
            // Handle REQUEST_PARENT_ORIGIN message
            if (isRequestParentOriginMessage(event.data)) {
                console.log('📨 REQUEST_PARENT_ORIGIN received');
                
                if (!event.source) {
                    console.warn('⚠️ REQUEST_PARENT_ORIGIN: No event.source available');
                    return;
                }
                
                const currentOrigin = window.location.origin;
                const response = {
                    type: 'PROVIDE_PARENT_ORIGIN',
                    origin: currentOrigin
                };
                
                // Send response back to the requesting iframe
                try {
                    event.source.postMessage(response, event.origin);
                    console.log('✅ PROVIDE_PARENT_ORIGIN sent to ' + event.origin + ':', response);
                } catch (error) {
                    console.error('❌ Failed to send PROVIDE_PARENT_ORIGIN:', error);
                }
                
                return;
            }
            
            // Handle AUTH_SUCCESS message
            if (!isAuthSuccessMessage(event.data)) {
                console.log('Message type is not AUTH_SUCCESS or REQUEST_PARENT_ORIGIN, ignoring:', event.data?.type);
                return;
            }
            
            console.log('📨 AUTH_SUCCESS received:', event.data);
            
            // Verify origin (allow "*" for development flexibility)
            if (ALLOWED_ORIGIN !== '*' && event.origin !== ALLOWED_ORIGIN) {
                console.warn('Ignoring message from unauthorized origin: ' + event.origin);
                return;
            }
            
            // Validate IdentityAndKeyManager data
            if (!isValidIdentityAndKeyManager(event.data.data.identityAndKeyManager)) {
                console.error('Invalid IdentityAndKeyManager data received');
                updateStatus('Authentication failed: Invalid data format', 'error');
                document.getElementById('authButton').disabled = false;
                return;
            }
            
            console.log('Valid IdentityAndKeyManager data:', event.data.data.identityAndKeyManager);
            identityData = event.data.data.identityAndKeyManager;
            
            // Save to localStorage
            const success = saveToLocalStorage(identityData);
            if (success) {
                console.log('Identity key manager saved to localStorage successfully');
                updateStatus('Authentication successful!', 'success');
                
                document.getElementById('iframeContainer').classList.add('hidden');
                document.getElementById('authData').classList.remove('hidden');
                document.getElementById('authDataContent').textContent = JSON.stringify(identityData, null, 2);
                
                // Store auth cookie if provided
                if (event.data.cookie) {
                    document.cookie = event.data.cookie;
                }
            } else {
                updateStatus('Authentication failed: Could not save data', 'error');
                document.getElementById('authButton').disabled = false;
            }
        });
        
        // Load existing data on page load
        window.addEventListener('DOMContentLoaded', () => {
            identityData = loadFromLocalStorage();
            if (identityData) {
                updateStatus('Loaded existing authentication data', 'success');
                document.getElementById('authData').classList.remove('hidden');
                document.getElementById('authDataContent').textContent = JSON.stringify(identityData, null, 2);
            }
        });
        
        async function testGraphQLAPI() {
            if (!identityData) {
                updateStatus('No authentication data available', 'error');
                return;
            }
            
            const queryTextarea = document.getElementById('graphqlQuery');
            const variablesTextarea = document.getElementById('graphqlVariables');
            const query = queryTextarea.value.trim();
            
            if (!query) {
                updateStatus('Please enter a GraphQL query', 'error');
                return;
            }
            
            let variables = {};
            try {
                const variablesText = variablesTextarea.value.trim();
                console.log('Variables input text:', variablesText);
                
                if (variablesText && variablesText !== '{}') {
                    variables = JSON.parse(variablesText);
                    console.log('Parsed variables:', variables);
                }
            } catch (error) {
                console.error('JSON parsing error:', error);
                updateStatus('Invalid JSON in variables field: ' + error.message, 'error');
                return;
            }
            
            updateStatus('Executing GraphQL query...', 'info');
            
            const requestBody = {
                query: query,
                variables: variables
            };
            console.log('GraphQL request body:', requestBody);
            
            try {
                const response = await fetch(BACKEND_URL + '/graphql', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });
                
                if (!response.ok) {
                    throw new Error('GraphQL request failed: ' + response.status);
                }
                
                const data = await response.json();
                updateStatus('GraphQL query executed successfully!', 'success');
                console.log('GraphQL Response:', data);
                
                // Display response in the UI
                document.getElementById('graphqlResponse').classList.remove('hidden');
                document.getElementById('graphqlResponseContent').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                updateStatus('GraphQL query failed: ' + error.message, 'error');
                console.error('GraphQL Error:', error);
            }
        }
        
        function clearStoredData() {
            try {
                localStorage.removeItem(STORAGE_KEY);
                identityData = null;
                updateStatus('Cleared stored authentication data', 'info');
                document.getElementById('authData').classList.add('hidden');
                document.getElementById('graphqlResponse').classList.add('hidden');
                document.getElementById('authButton').disabled = false;
            } catch (error) {
                console.error('Failed to clear stored data:', error);
                updateStatus('Failed to clear data', 'error');
            }
        }
    </script>
</body>
</html>
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      const html = HTML_TEMPLATE
        .replace('{{TARGET_IFRAME_URL}}', env.TARGET_IFRAME_URL || '')
        .replace('{{BACKEND_URL}}', env.BACKEND_URL || '')
        .replace(/{{ALLOWED_ORIGIN}}/g, env.ALLOWED_ORIGIN || '');

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'X-Frame-Options': 'SAMEORIGIN',
          'Content-Security-Policy': `frame-src ${env.ALLOWED_ORIGIN || 'none'}; script-src 'unsafe-inline' 'self';`,
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
