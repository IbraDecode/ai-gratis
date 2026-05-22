# SIbra AI API

**Author:** Ibra Decode  
**Version:** 2.0.0

## Model

| ID | Name | Engine |
|---|---|---|
| `gemini` | Gemini | Gemini |
| `deepseek` | DeepSeek V3 | DeepSeek |
| `deepseek-r1` | DeepSeek R1 | DeepSeek (reasoning) |
| `unlimited-std` | Standard | Unlimited |
| `gpt` | GPT-5.4 Mini | GPT |

## Endpoints

### `GET /`
Info API.

### `GET /api/models`
Daftar model.

### `POST /api/chat`

**Body:**
```json
{
  "prompt": "halo",
  "model": "gemini",
  "stream": false
}
```

| Field | Type | Default | Ket |
|---|---|---|---|
| `prompt` | string | - | wajib |
| `model` | string | `gemini` | ID model |
| `stream` | bool | `false` | streaming |

## Contoh

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"cerita pendek","model":"deepseek"}'

curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"hitung 2+2","model":"deepseek-r1","stream":true}'
```

## Running

```bash
npm start
```
