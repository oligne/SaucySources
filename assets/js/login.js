(function(){
  const KEY_PROFILE = 'saucy_current_profile'; // 'vincent' | 'coline'
  const KEY_VAULT_PREFIX = 'creatorVault_v1';  // we'll suffix with profile

  function setOwnerFromStorage(){
    const owner = (localStorage.getItem(KEY_PROFILE)||'').trim();
    const el = document.querySelector('.owner-name');
    if (el) el.textContent = owner ? `${owner}'s` : '';
  }

  function computeVaultKey(profile){
    return `${KEY_VAULT_PREFIX}_${profile.toLowerCase()}`;
  }

  function migrateIfNeeded(profile){
    // If old shared key exists and profile-specific is empty, copy it
    const old = localStorage.getItem(KEY_VAULT_PREFIX);
    const pfKey = computeVaultKey(profile);
    if (old && !localStorage.getItem(pfKey)){
      localStorage.setItem(pfKey, old);
    }
  }

  function onContinue(){
    const input = document.getElementById('pseudo');
    const raw = (input.value||'').trim().toLowerCase();
    if (!raw) return;
    let profile = null;
    if (raw.startsWith('v')) profile = 'vincent';
    if (raw.startsWith('c')) profile = 'coline';
    if (!profile){
      const hint=document.getElementById('loginHint');
      if(hint) hint.textContent='Only known profiles are allowed';
      return;
    }
    localStorage.setItem(KEY_PROFILE, profile);
    migrateIfNeeded(profile);
    // redirect to add page
    window.location.href = 'index_creator_vault.html';
  }

  // Bind Enter on input and click on the "Enter to continue" link
  const input = document.getElementById('pseudo');
  if(input){ input.addEventListener('keydown', e=>{ if(e.key==='Enter') onContinue(); }); }
  const link = document.getElementById('continueLink');
  if(link){ link.addEventListener('click', e=>{ e.preventDefault(); onContinue(); }); }

  setOwnerFromStorage();
})();

// Allow pressing Enter anywhere on the page to continue when the input is focused
(function enableEnterSubmit(){
  const input = document.getElementById('pseudo');
  const btn = document.getElementById('continueBtn');
  if(!input || !btn) return;
  // Already bound on keydown inside the IIFE, but ensure the button behaves as default submit
  btn.type = 'button';
})();
