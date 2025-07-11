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
        
        <div id="authData" class="hidden">
            <h2>Authentication Data</h2>
            <pre id="authDataContent"></pre>
            
            <button onclick="decodeJWT()" style="margin-left: 10px; background-color: #28a745;">Decode JWT</button>
            <button onclick="clearStoredData()" style="margin-left: 10px; background-color: #dc3545;">Clear Stored Data</button>
            
            <div id="jwtDecodeResponse" class="hidden">
                <h3>JWT Decode Result</h3>
                <pre id="jwtDecodeResponseContent"></pre>
            </div>
        </div>
    </div>

    <script>
        const POPUP_URL = '{{TARGET_IFRAME_URL}}';
        const BACKEND_URL = '{{BACKEND_URL}}';
        const ALLOWED_ORIGIN = '{{ALLOWED_ORIGIN}}';
        const STORAGE_KEY = 'identity_key_manager';
        
        let identityData = null;
        let authPopup = null;
        
        function updateStatus(message, type = 'info') {
            const statusEl = document.getElementById('status');
            statusEl.textContent = message;
            statusEl.className = 'status ' + type;
        }
        
        function startAuth() {
            updateStatus('Opening authentication popup...', 'info');
            document.getElementById('authButton').disabled = true;
            
            // Popup window settings
            const popupWidth = 500;
            const popupHeight = 600;
            const left = Math.max(0, (screen.width - popupWidth) / 2);
            const top = Math.max(0, (screen.height - popupHeight) / 2);

            const popupFeatures = 'width=' + popupWidth + ',height=' + popupHeight + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes,status=no,menubar=no,toolbar=no,location=no';

            try {
                // Open the popup window with the specified URL
                authPopup = window.open(POPUP_URL,  window.location.origin, popupFeatures);

                // Check if popup was blocked
                if (!authPopup || authPopup.closed) {
                    updateStatus('Popup blocked. Please allow popups and try again.', 'error');
                    document.getElementById('authButton').disabled = false;
                    return;
                }

                // Monitor popup closure
                const checkClosed = setInterval(() => {
                    if (authPopup && authPopup.closed) {
                        clearInterval(checkClosed);
                        if (document.getElementById('authButton').disabled) {
                            updateStatus('Authentication cancelled', 'info');
                            document.getElementById('authButton').disabled = false;
                        }
                    }
                }, 1000);

                updateStatus('Please complete authentication in the popup window...', 'info');

            } catch (error) {
                console.error('Failed to open popup:', error);
                updateStatus('Failed to open popup window', 'error');
                document.getElementById('authButton').disabled = false;
            }
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
            console.log('Message origin:', event.origin);
            console.log('Message source:', event.source);
            console.log('Current authPopup:', authPopup);

            // Handle AUTH_SUCCESS message
            if (!isAuthSuccessMessage(event.data)) {
                console.log('Message type is not AUTH_SUCCESS ignoring:', event.data?.type);
                return;
            }
            
            console.log('📨 AUTH_SUCCESS received:', event.data);
            
            // Verify origin (allow "*" for development flexibility)
            if (ALLOWED_ORIGIN !== '*' && event.origin !== ALLOWED_ORIGIN) {
                console.warn('Ignoring message from unauthorized origin: ' + event.origin);
                return;
            }

            // Verify message source is from our popup (only if popup is active)
            if (authPopup && !authPopup.closed && event.source !== authPopup) {
                console.warn('Message received from unexpected source');
                console.log('Expected source:', authPopup);
                console.log('Actual source:', event.source);
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

                // Close popup window
                if (authPopup && !authPopup.closed) {
                    authPopup.close();
                }
                authPopup = null;

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

        async function decodeJWT() {
            updateStatus('Decoding JWT...', 'info');

            try {
                const response = await fetch(BACKEND_URL + '/decode', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                if (!response.ok) {
                    throw new Error('JWT decode request failed: ' + response.status);
                }

                const data = await response.json();
                updateStatus('JWT decoded successfully!', 'success');
                console.log('JWT Decode Response:', data);

                // Display response in the UI
                document.getElementById('jwtDecodeResponse').classList.remove('hidden');
                document.getElementById('jwtDecodeResponseContent').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                updateStatus('JWT decode failed: ' + error.message, 'error');
                console.error('JWT Decode Error:', error);
            }
        }

        function clearStoredData() {
            try {
                localStorage.removeItem(STORAGE_KEY);
                identityData = null;
                updateStatus('Cleared stored authentication data', 'info');
                document.getElementById('authData').classList.add('hidden');
                document.getElementById('jwtDecodeResponse').classList.add('hidden');
                document.getElementById('authButton').disabled = false;

                // Close popup if still open
                if (authPopup && !authPopup.closed) {
                    authPopup.close();
                }
                authPopup = null;
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

    if (url.pathname === "/") {
      const html = HTML_TEMPLATE.replace("{{TARGET_IFRAME_URL}}", env.TARGET_IFRAME_URL || "")
        .replace("{{BACKEND_URL}}", env.BACKEND_URL || "")
        .replace(/{{ALLOWED_ORIGIN}}/g, env.ALLOWED_ORIGIN || "");

      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy": `script-src 'unsafe-inline' 'self';`,
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
