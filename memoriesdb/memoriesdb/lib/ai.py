import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Iterator, List, Optional

import httpx
import ollama

logger = logging.getLogger(__name__)


@dataclass
class AIMessage:
    role: str = "assistant"
    content: str = ""
    thinking: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class AIChunk:
    message: AIMessage
    done: bool = False


_ollama_connection = None
_debug_stream = os.getenv("LLM_DEBUG_STREAM", "").lower() in {"1", "true", "yes", "on"}


def model_api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "")


def chat(**kw):
    proto = os.getenv("LLM_PROTOCOL", "ollama").strip().lower() or "ollama"
    if proto == "ollama":
        return ollama_chat(**kw)
    if proto in {"openai", "openai_compatible"}:
        return openai_chat(**kw)
    raise ValueError(f"Unsupported LLM_PROTOCOL: {proto!r}")


def ollama_chat(messages: List[Dict[str, Any]], model: str, stream: bool = True,
                tools: Optional[Iterable[Dict[str, Any]]] = None,
                max_tokens: int = 0,
                max_retries: int = 3, retries: int = 0) -> Iterable[AIChunk]:
    global _ollama_connection
    kw: Dict[str, Any] = dict(messages=messages, model=model, stream=stream)
    if max_tokens:
        kw["max_tokens"] = max_tokens
    if tools:
        kw["tools"] = list(tools)
    last_exc: Optional[Exception] = None
    while retries < max_retries:
        try:
            if _ollama_connection is None:
                _ollama_connection = ollama.Client()
            response = _ollama_connection.chat(**kw)
            return wrap_ollama_response(response)
        except Exception as exc:
            last_exc = exc
            retries += 1
            logger.warning(
                "ollama_chat retry %d/%d failed for model=%r: %s",
                retries,
                max_retries,
                model,
                exc,
            )
    if last_exc is not None:
        logger.exception(
            "ollama_chat failed after %d retries for model=%r",
            max_retries,
            model,
            exc_info=last_exc,
        )
    return []


def wrap_ollama_response(response: Any) -> Iterable[AIChunk]:
    if type(response).__name__ == "generator":
        return (_normalize_ollama_chunk(chunk) for chunk in response)
    return [_normalize_ollama_chunk(response)]


def _normalize_ollama_chunk(chunk: Any) -> AIChunk:
    message = getattr(chunk, "message", None) or {}
    if hasattr(message, "get"):
        role = getattr(message, "role", None) or message.get("role", "assistant")
        content = getattr(message, "content", None) or message.get("content", "") or ""
        thinking = getattr(message, "thinking", None) or message.get("thinking", "") or ""
        tool_calls = getattr(message, "tool_calls", None) or message.get("tool_calls", []) or []
    else:
        role = getattr(message, "role", "assistant")
        content = getattr(message, "content", "") or ""
        thinking = getattr(message, "thinking", "") or ""
        tool_calls = getattr(message, "tool_calls", None) or []
    done = getattr(chunk, "done", None)
    if done is None and hasattr(chunk, "get"):
        done = chunk.get("done")
    normalized = AIChunk(
        message=AIMessage(
            role=role,
            content=content,
            thinking=thinking,
            tool_calls=tool_calls,
        ),
        done=bool(done),
    )
    if _debug_stream:
        logger.info(
            "AI CHUNK role=%r content=%r done=%r",
            normalized.message.role,
            normalized.message.content,
            normalized.done,
        )
    return normalized


def openai_chat(messages: List[Dict[str, Any]], model: str,
                stream: bool = True, max_tokens: int = 0,
                tools: Optional[Iterable[Dict[str, Any]]] = None,
                max_retries: int = 3, retries: int = 0) -> Iterable[AIChunk]:
    base_url = os.getenv("OPENAI_BASE_URL", "http://localhost:8000/v1").rstrip("/")
    url = base_url + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    api_key = model_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "reasoning_effort": "none"
    }
    if max_tokens:
        payload['max_tokens'] = max_tokens
    if tools:
        payload['tools'] = tools
    last_exc: Optional[Exception] = None
    while retries < max_retries:
        try:
            if stream:
                return _openai_stream(url, headers, payload)
            with httpx.Client(timeout=None) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
            return [_normalize_openai_completion(data, done=True)]
        except Exception as exc:
            last_exc = exc
            retries += 1
            logger.warning(
                "openai_chat retry %d/%d failed for model=%r url=%r: %s",
                retries,
                max_retries,
                model,
                url,
                exc,
            )
    if last_exc is not None:
        logger.exception(
            "openai_chat failed after %d retries for model=%r url=%r",
            max_retries,
            model,
            url,
            exc_info=last_exc,
        )
    return []


def _openai_stream(url: str, headers: Dict[str, str],
                   payload: Dict[str, Any]) -> Iterator[AIChunk]:
    with httpx.Client(timeout=None) as client:
        with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            saw_done = False
            for line in resp.iter_lines():
                if not line:
                    continue
                if isinstance(line, bytes):
                    line = line.decode("utf-8", errors="replace")
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    saw_done = True
                    break
                payload = json.loads(data)
                chunk = _normalize_openai_stream_chunk(payload)
                if chunk is None:
                    continue
                if chunk.done:
                    saw_done = True
                yield chunk
            if not saw_done:
                yield AIChunk(message=AIMessage(), done=True)


def _normalize_openai_completion(payload: Dict[str, Any], done: bool) -> AIChunk:
    choice = (payload.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    normalized = AIChunk(
        message=AIMessage(
            role=message.get("role", "assistant"),
            content=message.get("content") or "",
        ),
        done=done,
    )
    if _debug_stream:
        logger.info(
            "AI CHUNK role=%r content=%r done=%r",
            normalized.message.role,
            normalized.message.content,
            normalized.done,
        )
    return normalized


def _normalize_openai_stream_chunk(payload: Dict[str, Any]) -> Optional[AIChunk]:
    choice = (payload.get("choices") or [{}])[0]
    delta = choice.get("delta") or {}
    finish_reason = choice.get("finish_reason")
    role = delta.get("role", "assistant")
    content = delta.get("content") or ""
    if not content and not finish_reason:
        return None
    normalized = AIChunk(
        message=AIMessage(role=role, content=content),
        done=bool(finish_reason),
    )
    if _debug_stream:
        logger.info(
            "AI CHUNK role=%r content=%r done=%r",
            normalized.message.role,
            normalized.message.content,
            normalized.done,
        )
    return normalized
