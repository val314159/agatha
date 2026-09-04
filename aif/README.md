
# aif - AI Frens!

AI Frens is an AI assistant application with both text and voice interfaces. This project demonstrates how to build a simple AI assistant using a microservice architecture with a Bottle backend and a JavaScript frontend.

## Features

- Text-based chat interface
- Voice-based interaction with speech recognition
- Streaming responses for real-time feedback
- Text-to-speech audio generation
- Modern, responsive UI with animated avatar
- Keyboard shortcuts for enhanced usability

## Prerequisites

- Python 3.8 or higher
- Node.js and npm
- A modern web browser (Chrome or Edge recommended for speech recognition)

## Project Structure

```
├── frontend/           # JavaScript frontend
│   ├── src/            # Source files
│   │   ├── index.html  # Main HTML file
│   │   ├── styles.css  # CSS styles
│   │   └── app.js      # JavaScript functionality
│   └── package.json    # Node.js dependencies
├── microservice/       # Bottle microservice for AI processing
<<<<<<< HEAD
│   ├── app.py          # Microservice implementation
│   ├── requirements.txt # Python dependencies
│   └── README.md       # Microservice documentation
├── .env                # Environment variables
=======
│   ├── app.py          # Microservice implementation with streaming support
│   ├── ai.py           # AI response generation
│   ├── config.py       # Configuration settings
│   ├── requirements.txt # Python dependencies
│   └── audio/          # Directory for generated audio files
├── ollama/             # Ollama integration files
>>>>>>> dev
├── Makefile            # Build automation
└── README.md           # This file
```

## Setup and Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd aif
```

### 2. Install dependencies

The project uses a Makefile to simplify setup and running. To install all dependencies:

```bash
make install
```

This will:
- Create a Python virtual environment (`venv`)
- Install Python dependencies for the microservice
- Install npm packages for the frontend

### 3. Running the application

To run both the microservice and frontend:

```bash
make run
```

Alternatively, you can run them separately:

```bash
# Run just the frontend
make run-frontend

# Run just the microservice
make run-microservice
```

## Accessing the Application

- Microservice API: http://localhost:5002
- Frontend: http://localhost:1234

## API Endpoints

<<<<<<< HEAD
### Flask Backend (Proxy)
- `POST /api/text` - Text-based AI assistant (proxies to microservice)
- `POST /api/voice` - Voice-based AI assistant (proxies to microservice)
- `GET /api/audio/<filename>` - Serves audio files (proxies to microservice)
- `GET /api/health` - Health check endpoint

### Bottle Microservice
- `POST /api/text` - Processes text input and returns AI responses
- `POST /api/voice` - Processes voice input and returns AI responses with audio
- `GET /api/audio/<filename>` - Serves generated audio files
- `GET /api/health` - Health check endpoint

## Architecture

The application follows a microservice architecture with three main components:

1. **Frontend**: A JavaScript application that provides the user interface for text and voice interactions.
2. **Backend**: A Flask application that serves as an API gateway, routing requests to the appropriate microservice.
3. **AI Microservice**: A Bottle application that handles AI processing, including text responses and voice synthesis.

This architecture provides several benefits:
- Separation of concerns between UI, API routing, and AI processing
- Independent scaling of each component
- Ability to replace or upgrade the AI component without affecting the rest of the application
- Simplified testing and maintenance

## Development Notes

- The AI responses are currently mocked. In a production environment, you would integrate with OpenAI or another AI service.
- Voice recognition is simulated in the frontend. In a real application, you would use the Web Speech API or a dedicated speech-to-text service.
- The microservice uses Bottle, a lightweight WSGI web framework, which is ideal for single-purpose services.
=======
### Streaming Endpoint
- `POST /api/stream` - Unified streaming endpoint for all interactions (text and voice)
  - Accepts JSON with `text` (user input) and `audio` (boolean, whether to generate audio)
  - Returns server-sent events (SSE) with streaming text responses and audio URL when complete

### Other Endpoints
- `GET /api/audio/<filename>` - Serves generated audio files
- `GET /api/health` - Health check endpoint

## Keyboard Shortcuts

- `Alt+A` - Toggle avatar visibility
- `Alt+V` - Toggle voice recognition mode
- `Alt+K` - Toggle keyboard shortcuts panel

## Architecture

The application follows a microservice architecture with two main components:

1. **Frontend**: A JavaScript application that provides the user interface for text and voice interactions, using the Web Speech API for speech recognition.
2. **AI Microservice**: A Bottle application that handles AI processing, including streaming text responses and text-to-speech synthesis using gTTS.

This architecture provides several benefits:
- Real-time streaming responses for better user experience
- Unified API endpoint for all types of interactions
- Separation of concerns between UI and AI processing
- Simplified deployment and maintenance

## Development Notes

- The application uses server-sent events (SSE) for streaming responses, providing real-time feedback to users.
- Voice recognition is implemented using the Web Speech API, which is supported in Chrome and Edge browsers.
- Text-to-speech is generated using Google's Text-to-Speech (gTTS) library.
- The microservice can be configured to use different AI providers, with Ollama integration available.
>>>>>>> dev

## License

MIT
