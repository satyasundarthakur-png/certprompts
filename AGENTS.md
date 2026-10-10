<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the uploaded certificate studio in a lazily loaded component behind ClientOnly at `/`; its document processing and device settings require browser APIs.
- Preserve the uploaded app's local analysis and optional user-supplied provider modes; do not provision an optional hosted AI service as part of deployment alone.
- Define the imported studio palette and control styles centrally in src/styles.css and expose its buttons through the shared Button variants to preserve the supplied design.
