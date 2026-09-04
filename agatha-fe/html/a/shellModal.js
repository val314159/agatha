/**
 * Manages the Shell Modal functionality.
 *
 * Required HTML structure:
 * <dialog id="shell-modal" class="modal">
 *   <div class="modal-box">
 *     <form method="dialog">
 *       <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
 *     </form>
 *     <h3 class="font-bold text-lg">Shell Modal</h3>
 *     <p class="py-4">Shell content goes here...</p> 
 *     <div class="modal-action">
 *       <form method="dialog">
 *         <button class="btn">Close</button>
 *       </form>
 *     </div>
 *   </div>
 *   <form method="dialog" class="modal-backdrop"><button>close</button></form>
 * </dialog>
 */
export class ShellModal {
    constructor() {
        this.modalElement = null;
        console.log('[ShellModal] Initialized');
    }

    init() {
        this.modalElement = document.getElementById('shell-modal');
        if (!this.modalElement) {
            console.error('[ShellModal] Error: Modal element #shell-modal not found in the DOM.');
            return;
        }

        // Add any specific event listeners or setup for the shell modal here
        console.log('[ShellModal] Event listeners attached.');
    }

    show() {
        if (this.modalElement && typeof this.modalElement.showModal === 'function') {
            console.log('[ShellModal] Showing modal.');
            this.modalElement.showModal();
        } else {
            console.error('[ShellModal] Cannot show modal - element not found or lacks showModal method.');
        }
    }

    hide() {
        if (this.modalElement && typeof this.modalElement.close === 'function') {
            console.log('[ShellModal] Hiding modal.');
            this.modalElement.close();
        } else {
            console.error('[ShellModal] Cannot hide modal - element not found or lacks close method.');
        }
    }
}
