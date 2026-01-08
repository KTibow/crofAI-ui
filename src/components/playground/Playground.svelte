<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { parse } from "./microdown";

  let model = $state("kimi-k2-0905");
  let systemPrompt = $state("");
  let temperature = $state(1);
  let topP = $state(1);
  let allowFallbacks = $state(true);

  type Model = { id: string; name: string };
  let models: Model[] = $state([]);

  let prompt = $state("");
  type Message = {
    role: "user" | "assistant";
    content: string;
    reasoning?: string;
    ttft?: number;
    tps?: number;
  };
  let messages: Message[] = $state([]);
  let aborter: AbortController | undefined = $state();

  const updateModels = async () => {
    const r = await fetch("/v2/models");
    if (!r.ok) {
      throw new Error(`Models are ${r.status}ing`);
    }
    const { data }: { data: Model[] } = await r.json();
    models = data.map((m) => {
      let name = m.name;
      if (m.id.endsWith("-turbo")) {
        name += " (Turbo)";
      }
      if (m.id.endsWith("-eco")) {
        name += " (Eco)";
      }
      if (m.id.endsWith("-reasoner")) {
        name += " (Reasoner)";
      }
      return { id: m.id, name };
    });
  };
  async function* iterateStream(stream: ReadableStream) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  const send = async () => {
    const promptFixed = prompt.trim();
    if (!promptFixed) return;

    messages.push({
      role: "user",
      content: promptFixed,
    });
    prompt = "";

    const apiMessages: { role: string; content: string }[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (systemPrompt.trim()) {
      apiMessages.unshift({
        role: "system",
        content: systemPrompt.trim(),
      });
    }

    const start = Date.now();
    const r = await fetch("/v2/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: allowFallbacks ? model : `${model}:consistent`,
        temperature,
        top_p: topP,
        messages: apiMessages,
        stream: true,
      }),
      signal: aborter!.signal,
    });
    if (!r.ok) {
      throw new Error(`Generation failed with status ${r.status}`);
    }

    // Create reactive assistant message and add to array
    let assistantMsg: Message = $state({
      role: "assistant",
      content: "",
      reasoning: "",
    });
    messages.push(assistantMsg);

    let buffer = "";
    for await (const chunk of iterateStream(r.body!)) {
      buffer += new TextDecoder().decode(chunk);
      const parts = buffer.split("\n\n");
      buffer = parts.pop()!;
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const data = part.slice(6).trim();
        if (data == "[DONE]") continue;
        const parsed = JSON.parse(data);

        const delta = parsed.choices[0].delta;
        if (delta) {
          const { reasoning_content, content } = delta;
          if (reasoning_content) assistantMsg.reasoning! += reasoning_content;
          if (content) assistantMsg.content += content;
          if (reasoning_content?.trim() || content?.trim()) {
            assistantMsg.ttft ||= Date.now() - start;
          }
        }

        if (parsed.usage) {
          assistantMsg.tps = parsed.usage.tokens_per_second;
        }
      }
    }
  };
  const sendWrapped = async (e: SubmitEvent) => {
    e.preventDefault();
    aborter = new AbortController();
    try {
      await send();
    } finally {
      aborter = undefined;
    }
  };

  onMount(() => {
    updateModels();
  });
</script>

<div class="messages">
  {#each messages as message}
    <div class="message {message.role}" in:slide={{ duration: 200 }}>
      {#if message.role == "user"}
        <div class="message-content">
          <p>{message.content}</p>
        </div>
      {:else}
        {#if message.reasoning?.trim()}
          <div class="reasoning">
            <h3 class="font-title-medium">Reasoning</h3>
            <div class="prose">{@html parse(message.reasoning)}</div>
          </div>
        {/if}
        <div class="message-content">
          <div class="prose">{@html parse(message.content)}</div>
        </div>
        {#if message.ttft || message.tps}
          <div class="message-stats font-label-medium">
            {#if message.ttft}
              <span>TTFT: {(message.ttft / 1000).toFixed(2)}s</span>
            {/if}
            {#if message.tps}
              <span>{message.tps.toFixed(0)} TPS</span>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/each}
</div>
<form onsubmit={sendWrapped} class="prompt-container">
  <!-- svelte-ignore a11y_autofocus -->
  <textarea
    placeholder="Message"
    autofocus
    onkeydown={(e) => {
      if (e.key == "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.currentTarget.form?.requestSubmit();
      }
    }}
    bind:value={prompt}
  ></textarea>
  <div class="controls">
    <select class="model-selector" bind:value={model}>
      {#each models as m}
        <option value={m.id}>{m.name}</option>
      {/each}
    </select>
    {#if messages.length > 0}
      <button
        class="clear font-label-large layer"
        onclick={() => {
          messages = [];
        }}
      >
        Clear
      </button>
    {/if}
    <button class="send font-label-large layer" disabled={!prompt || Boolean(aborter)}>
      {aborter ? "Generating..." : "Send"}
    </button>
  </div>
</form>
<div class="sidebar">
  <label>
    <p class="font-label-large">
      <span>Temperature</span>
      <output>{temperature.toFixed(1)}</output>
    </p>
    <input type="range" min="0" max="2" step="any" bind:value={temperature} />
  </label>
  <label>
    <p class="font-label-large">
      <span>Top P</span>
      <output>{topP.toFixed(1)}</output>
    </p>
    <input type="range" min="0" max="1" step="any" bind:value={topP} />
  </label>
  <label class="checkbox">
    <p class="font-label-large">Allow fallback servers</p>
    <input type="checkbox" bind:checked={allowFallbacks} />
  </label>
  <label class="prompt">
    <p class="font-label-large">System prompt</p>
    <textarea bind:value={systemPrompt} placeholder="You are a..."></textarea>
  </label>
</div>

<style>
  .messages,
  .prompt-container {
    width: 100%;
    max-width: 50rem;
    justify-self: center;
    grid-column: 1;
  }
  .sidebar {
    grid-column: 2;
    grid-row: 1 / span 2;
    position: sticky;
    top: 0;
    bottom: 0;
    max-height: 100dvh;
    padding: 0.5rem;
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .message {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    max-width: 50rem;
    align-self: center;
    &.user {
      .message-content {
        background-color: var(--m3c-primary-container-subtle);
        padding: 0.5rem;
        border-radius: 1rem;
        p {
          white-space: pre-wrap;
        }
      }
    }
    &.assistant {
      align-self: flex-start;
      .reasoning {
        background-color: var(--m3c-tertiary-container-subtle);
        color: var(--m3c-on-tertiary-container-subtle);
        padding: 0.5rem;
        border-radius: 1rem;
        h3 {
          margin: 0 0 0.5rem 0;
        }
      }
      .message-stats {
        display: flex;
        gap: 1rem;
        color: var(--m3c-on-surface-variant);
      }
    }
  }
  .prose > :global(:first-child) {
    margin-top: 0;
  }
  .prompt-container {
    display: grid;
    position: sticky;
    bottom: 0;

    border-radius: 1rem 1rem 0 0;
    background-color: var(--m3c-surface-container-low);
    textarea {
      resize: none;
      padding-block: 0.5rem 2.5rem;
      padding-inline: 0.75rem;
      min-height: 3rem;
      &:focus {
        outline: none;
      }
    }
    .controls {
      display: flex;

      position: absolute;
      inset: auto 0 0 0;
      pointer-events: none;
      > * {
        display: flex;
        align-items: center;

        height: 2rem;
        border-radius: 1rem;
        padding-inline: 0.75rem;
        background-color: oklab(from var(--m3c-surface-container) l a b / 0.5);
        color: var(--m3c-on-surface-variant);

        &:enabled {
          cursor: pointer;
        }

        transition:
          color 200ms,
          opacity 200ms;
        pointer-events: auto;
      }
    }

    select {
      margin-right: auto;
    }
    select:hover {
      color: var(--m3c-on-surface);
    }
    .clear {
      color: var(--m3c-error);
    }
    .send {
      color: var(--m3c-primary);
      &:disabled {
        opacity: 0.38;
      }
    }
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    > * {
      padding: 0.5rem;
      border-radius: 1rem;
      background-color: var(--m3c-surface-container-lowest);
      color: var(--m3c-on-surface-variant);
    }
  }

  label {
    display: flex;
    flex-direction: column;
    p {
      display: flex;
      justify-content: space-between;
    }
  }

  .checkbox {
    flex-direction: row;
    justify-content: space-between;
  }

  .prompt {
    position: relative;
    flex-grow: 1;
  }
  .prompt textarea {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    resize: none;
    padding: 2rem 0.5rem 0.5rem 0.5rem;
    color: var(--m3c-on-surface);
    &:focus {
      outline: none;
    }
  }
</style>
