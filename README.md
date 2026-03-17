# How to run Anna Operating System in Development Mode

1. Optional: Install Ubuntu 22.04 into virtual machine for safety and do next steps in it
2. Install Ollama (Set `OLLAMA_HOST` environment variable to `0.0.0.0:11434` before starting Ollama)
3. Launch Ollama and login to the server for using Claud models with free tier limits
4. Run `ollama pull gpt-oss:120b-cloud` for inference
5. Optional: Run `ollama pull embeddinggemma` for RAG embeddings (not supported yet)
6. Run `git clone git@github.com:evgenyigumnov/anna-operating-system.git`
7. Run `cd anna-operating-system`
8. Add `OPENAPI_BASE_URL=http://192.168.10.12:11434/v1` to `.env` file (replace 192.168.10.12 with your IP)
9. Run `npm install`
10. Run `npm start`