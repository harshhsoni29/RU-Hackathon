/** Title card. Play stays blocked until the rail control is used. */

export function mountTitle(onEnter) {
  const root = document.createElement('section');
  root.id = 'title';
  root.innerHTML = `
    <div class="card">
      <p class="eyebrow">The rail</p>
      <h1>Hold'em Den</h1>
      <p>Five flies are already in their chairs. You are on the rail, watching a hand you are not in.</p>
      <ul>
        <li><i style="background:#1f7a4d"></i> Vera</li>
        <li><i style="background:#d4892a"></i> Buzz</li>
        <li><i style="background:#3d5a80"></i> Nib</li>
        <li><i style="background:#d4537e"></i> Callie</li>
        <li><i style="background:#c23b22"></i> Mani</li>
      </ul>
      <button type="button" data-enter>Take the rail</button>
    </div>
  `;
  document.body.appendChild(root);
  const button = root.querySelector('[data-enter]');
  button.addEventListener('click', () => {
    root.hidden = true;
    onEnter();
  });
  return {
    root,
    isOpen() {
      return !root.hidden;
    },
  };
}
