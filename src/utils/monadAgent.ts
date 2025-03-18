// src/utils/monadAgent.ts
export const sendMessageToAgent = async (input: string, privateKey?: string): Promise<{ response: string }> => {
  const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT; // .env se URL fetch karo

  if (!API_ENDPOINT) {
    throw new Error('API endpoint not configured. Please set VITE_API_ENDPOINT in .env file.');
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input, privateKey }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data; // { response: "..." }
  } catch (error) {
    console.error('Error sending message to agent:', error);
    throw error; // ChatInterface mein error handle hoga
  }
};