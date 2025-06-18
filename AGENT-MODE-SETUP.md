# 🤖 Agent Mode Setup - Continue + Vertex AI

Este guia mostra como ativar o **Agent Mode** no Continue usando nosso servidor Vertex AI como gateway.

## 📋 Pré-requisitos

1. **Continue Extension** instalada no VS Code
2. **Servidor AI local** rodando (este projeto)
3. **Autenticação Google Cloud** configurada

## 🚀 Passo a Passo

### 1. Iniciar o Servidor AI

```bash
# No diretório do projeto
npm start
```

O servidor deve estar rodando em `http://localhost:3000`

### 2. Configurar Continue

#### Opção A: Configuração Rápida (Recomendada)
1. Abra o Continue no VS Code
2. Vá em **Settings** → **Configuration**
3. Selecione **Import from file**
4. Escolha um dos arquivos:
   - `continue-agent.yaml` (configuração otimizada para Agent)
   - `continue-complete.yaml` (configuração completa com todos os modelos)
   - `continue-working.yaml` (configuração básica)

#### Opção B: Configuração Manual
1. Abra o Continue no VS Code
2. Vá em **Settings** → **Configuration**
3. Cole a configuração abaixo:

```yaml
%YAML 1.1
---
name: "Agent Mode Vertex AI"
schema: v1

model_defaults: &model_defaults
  provider: openai
  apiKey: sk-vertex-ai
  apiBase: http://localhost:3000/v1
  roles:
    - chat
  capabilities:
    - tool_use
  defaultCompletionOptions:
    contextLength: 128000
    temperature: 0.7

models:
  - name: "Gemini 1.5 Pro (Agent)"
    <<: *model_defaults
    model: "gemini-1.5-pro"

context:
  - provider: code
  - provider: folder
  - provider: codebase
  - provider: terminal

rules:
  - name: "Tool Usage"
    rule: "If you have access to tools, use them to avoid making assumptions about the project"
```

### 3. Ativar o Agent Mode

1. **Abra o Continue Chat** (Ctrl+Shift+P → "Continue: Open Chat")
2. **Procure pelo seletor de modo** abaixo da caixa de input
3. **Clique em "Chat"** e mude para **"Agent"**
4. ✅ **Agent Mode ativado!**

## ✅ Principais Correções Feitas

### Estrutura YAML Atualizada
- ✅ **`schema: v1`** - Versão correta do schema
- ✅ **`model_defaults`** - Configurações reutilizáveis com `&` e `<<:`
- ✅ **`capabilities: [tool_use]`** - Habilita ferramentas (não `tools`)
- ✅ **`context:`** - Context providers (não `contextProviders:`)
- ✅ **`rules:`** com `name:` e `rule:`** - Formato correto das regras

### Diferenças Principais
| ❌ Formato Antigo | ✅ Formato Novo |
|---|---|
| `schema: "1"` | `schema: v1` |
| `capabilities: ["tools"]` | `capabilities: ["tool_use"]` |
| `contextProviders:` | `context:` |
| `rules: ["texto"]` | `rules: [{name: "Nome", rule: "texto"}]` |

## 🛠️ Como Usar o Agent Mode

### Comandos Naturais
O Agent Mode aceita instruções em linguagem natural:

```
Crie um novo arquivo README.md com documentação para este projeto
```

```
Analise todos os arquivos JavaScript e sugira melhorias de performance
```

```
Implemente testes unitários para o arquivo vertexService.js
```

### Ferramentas Disponíveis

O Agent tem acesso às seguintes ferramentas:

- ✅ **Ler arquivos** (automático)
- ✅ **Buscar no código** (automático)  
- ✅ **Ver estrutura do repo** (automático)
- ⚠️ **Criar/modificar arquivos** (pede permissão)
- ⚠️ **Executar comandos** (pede permissão)
- ⚠️ **Buscar na web** (pede permissão)

### Permissões

Por padrão, o Agent **pede permissão** antes de:
- Criar ou modificar arquivos
- Executar comandos no terminal
- Fazer buscas na web

Você pode:
- ✅ **Continue** - Aprovar a ação
- ❌ **Cancel** - Cancelar a ação

## 🎯 Modelos Disponíveis

Através do nosso gateway Vertex AI, o Agent tem acesso a:

### Google (Nativo)
- Gemini 1.5 Pro ⭐ (Recomendado para Agent)
- Gemini 1.5 Flash (Rápido)
- Gemini 2.0/2.5 (Mais recentes)

### Terceiros (via Model Garden)
- Claude 3.5 Sonnet (Anthropic)
- Llama 3.1 (Meta)
- Mistral Large (Mistral)
- Command R+ (Cohere)

## 🚨 Troubleshooting

### Agent Mode não aparece
- ✅ Verifique se o modelo tem `capabilities: ["tool_use"]`
- ✅ Confirme que o servidor está rodando
- ✅ Teste a conexão: `curl http://localhost:3000/v1/models`
- ✅ Use `schema: v1` (não `schema: "1"`)

### "Not Supported" message
- ✅ Adicione `capabilities: ["tool_use"]` ao modelo
- ✅ Use um modelo que suporta tool calling (Gemini, Claude)
- ✅ Verifique se está usando `context:` (não `contextProviders:`)

### YAML não carrega
- ✅ Use `%YAML 1.1` no início do arquivo
- ✅ Verifique indentação (use espaços, não tabs)
- ✅ Use a estrutura `model_defaults` com `&` e `<<:`

## 📝 Exemplos de Uso

### Análise de Código
```
Analise a estrutura deste projeto e identifique possíveis melhorias
```

### Implementação de Features
```
Adicione logging estruturado ao arquivo vertexService.js
```

### Debugging
```
O servidor está retornando erro 500, ajude-me a debuggar
```

### Refatoração
```
Refatore o código para seguir melhores práticas de Node.js
```

## 🎉 Pronto!

Agora você tem um **Agent Mode** poderoso que:
- 🤖 Executa tarefas complexas autonomamente
- 🔧 Usa múltiplos modelos AI via Vertex AI
- 🛡️ Pede permissão para mudanças importantes
- 📊 Analisa e modifica código inteligentemente

**Dica**: Use o arquivo `continue-agent.yaml` para a melhor experiência com Agent Mode! 