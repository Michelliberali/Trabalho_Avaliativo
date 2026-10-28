# Ponto Facial

Sistema de registro de ponto com cadastro de funcionários, captura de foto, reconhecimento facial pelo DeepFace e histórico de entrada, saída e intervalos. Projeto desenvolvido conforme a atividade avaliativa fornecida.

## Tecnologias

- React e Vite na interface
- FastAPI e SQLite na API
- DeepFace com detector OpenCV e modelo VGG-Face para validação e comparação facial

## Requisitos

- Node.js 20 ou superior
- Python 3.12 (versão usada no desenvolvimento)
- Câmera e navegador com permissão de acesso, ou uma foto para enviar

## Executar localmente

No terminal da pasta `backend`:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Em outro terminal, na pasta `frontend`:

```powershell
npm install
npm run dev
```

Acesse `http://127.0.0.1:5173`. A documentação da API fica em `http://127.0.0.1:8000/docs`. Na primeira análise facial, o DeepFace pode baixar os pesos do modelo e demorar alguns minutos.

Para executar os testes da API, instale `requirements-dev.txt` e rode `pytest -q` na pasta `backend`.

## Uso

1. Em **Funcionários**, cadastre nome, matrícula, cargo e uma foto com um único rosto nítido.
2. Em **Registrar ponto**, selecione entrada, saída, início ou fim do intervalo.
3. Capture ou envie uma foto. O sistema identifica o funcionário e grava o horário automaticamente.
4. Consulte os registros na **Visão geral**.

## Dados e privacidade

O SQLite e as fotos ficam em `backend/data/` e são ignorados pelo Git. As fotos são dados biométricos; obtenha consentimento e defina regras de acesso, retenção e exclusão antes de qualquer uso real. Esta é uma demonstração acadêmica local. Para produção, é necessário acrescentar autenticação, autorização, criptografia, proteção contra foto impressa ou replay (prova de vida), limites de uso e tratamento formal da LGPD. O reconhecimento facial pode falhar e deve ser confirmado por um responsável quando houver divergência.
