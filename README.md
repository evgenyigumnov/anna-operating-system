# How to run Anna Operating System in Development Mode

1. Optional: Install Ubuntu 22.04 into virtual machine for safety and do next steps in it
2. Install Ollama
3. Launch Ollama and login to the server for using Claud models with free tier limits
4. Run `ollama pull gpt-oss:120b-cloud` for inference
5. Optional: Run `ollama pull embeddinggemma` for RAG embeddings (not supported yet)
6. git clone git@github.com:evgenyigumnov/anna-operating-system.git
7. Run `cd anna-operating-system`
8. Run `npm install`
9. Run `npm start`