<script lang="ts">
  import { onMount } from 'svelte';
  import createMap from '$lib/map';

  let mapNode: HTMLElement;

  onMount(() => {
    createMap(mapNode);
  });
</script>

<a class="back" href="/index.html">&larr; Back to toolkit</a>
<section id="map"
    bind:this={mapNode}/>

<style lang="scss">
  :global(body) {
    margin: 0;
  }

  :global(.leaflet-colour-picker) {
    height: inherit;
    width: inherit;
    border: 0;
    cursor: pointer;
  }

  #map {
    height: 100vh;
    width: 100vw;
  }

  .back {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 1000;
    background: rgba(15, 17, 21, 0.85);
    color: #9aa0ab;
    padding: 8px 14px;
    border: 1px solid #2a2f3a;
    border-radius: 8px;
    font-family: 'Roboto', sans-serif;
    font-size: 0.85rem;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .back:hover {
    color: #ffffff;
    border-color: #06b6d4;
  }
</style>
