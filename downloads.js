async function loadDynamicDownloads() {
  const lecturesRoot = document.getElementById('downloads-lectures');
  const factsRoot = document.getElementById('downloads-facts');
  const proceedingsRoot = document.getElementById('downloads-proceedings');
  if (!lecturesRoot || !factsRoot || !proceedingsRoot) return;

  const setMessage = (message) => {
    lecturesRoot.textContent = message;
    factsRoot.textContent = message;
    proceedingsRoot.textContent = message;
  };

  try {
    const response = await fetch('/api/downloads/files');
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Failed to load files.');

    const files = (payload.files || []).filter((f) => typeof f.fileName === 'string');
    if (files.length === 0) {
      setMessage('No files uploaded yet.');
      return;
    }

    const groups = {
      Lectures: [],
      'Fact Sheets': [],
      'Program Proceedings': []
    };

    files.forEach((file) => {
      const section = file.section && groups[file.section] ? file.section : 'Lectures';
      groups[section].push(file);
    });

    const renderGroup = (root, groupFiles) => {
      if (!groupFiles.length) {
        root.textContent = 'No files in this section yet.';
        return;
      }
      root.innerHTML = groupFiles
        .map((f) => `<a class="btn downloads-btn" href="${f.url}" download>${f.fileName}</a>`)
        .join('');
    };

    renderGroup(lecturesRoot, groups.Lectures);
    renderGroup(factsRoot, groups['Fact Sheets']);
    renderGroup(proceedingsRoot, groups['Program Proceedings']);
  } catch {
    setMessage('Could not load files right now.');
  }
}

document.addEventListener('DOMContentLoaded', loadDynamicDownloads);
