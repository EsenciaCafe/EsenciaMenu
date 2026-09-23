export function temperatureIcons(item, english=false){
  const modes=[['hot',english?'Hot':'Caliente','<path d="M5 11h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 12h2a3 3 0 0 1 0 6h-2M7 3c-2 2 2 3 0 5M12 3c-2 2 2 3 0 5"/>'],['cold',english?'Cold':'Frío','<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M20 14l-4 1 1 4M4 14l4 1-1 4M20 10l-4-1 1-4"/>']];
  const icons=modes.filter(([mode])=>item.serving_temperatures?.includes(mode)).map(([,label,path])=>`<span class="temperature-icon" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`).join('');
  return icons?`<span class="temperature-icons">${icons}</span>`:'';
}
