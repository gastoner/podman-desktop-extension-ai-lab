<script lang="ts">
import type { InferenceServer } from '@shared/models/IInference';

export let object: InferenceServer;
</script>

{#if object.models.length === 1}
  <span class="text-[var(--pd-table-body-text)]">
    {object.models[0].name}
  </span>
{:else}
  <ul>
    {#each object.models as model (model.id)}
      <li class="text-[var(--pd-table-body-text)]">{model.name}</li>
    {/each}
  </ul>
{/if}
