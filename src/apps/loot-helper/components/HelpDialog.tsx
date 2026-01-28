import { useEffect } from 'react';
import { Youtube } from 'lucide-react';

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="help-dialog-overlay" onClick={onClose}>
      <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="help-dialog-header">
          <h2>How to Use</h2>
          <button className="help-dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="help-dialog-content">
          <section>
            <h3>Video Tutorial</h3>
            <p>
              <a href="https://youtu.be/wePdXVwQ4pk" target="_blank" rel="noopener noreferrer" className="video-link">
                <Youtube size={20} />
                Watch a quick walkthrough: How to Use the Looting Helper
              </a>
            </p>
          </section>

          <section>
            <h3>1. Set Your Crafting Goals</h3>
            <p>Use the search bar to find and add items you want to regularly craft. This builds your master list of requirements.</p>
          </section>
          
          <section>
            <h3>2. Identify Loot Priorities</h3>
            <p>The app automatically generates a list of all base resources and materials you need to loot to achieve these crafting goals.</p>
          </section>
          
          <section>
            <h3>3. Manage Your Stash</h3>
            <p>You can mark items as "I have enough in my stash" (e.g., if you already have plenty of batteries or wires). This dynamically reduces the "what to loot / keep" list, showing only what you still actually need.</p>
          </section>
          
          <section>
            <h3>4. Optimize Your Raids</h3>
            <p>Use this list during or after a raid to quickly understand what items to keep or salvage, versus what to leave behind or sell.</p>
          </section>

          <div className="help-dialog-example">
            <h3>Example Workflow</h3>
            <p>If you are aiming to craft a specific gadget, add it as a goal. The visualizer will show you the entire tree—from the final item down to the basic materials like "Circuit Boards" or "Chemicals". If you find a "Topside Item" during a raid, you can quickly check which materials it salvages into, helping you decide if it's worth the inventory space.</p>
          </div>

          <div className="help-dialog-note">
            <p><strong>Note:</strong> This tool specifically focuses on items needed for <strong>crafting</strong>. Remember to combine these requirements with what you might need for expeditions or projects.</p>
          </div>

          <section>
            <h3>Learning the Game</h3>
            <p>A key benefit of this tool is learning the relationship between "topside items" and the materials they provide. As you use the app, you'll develop a "feel" for what's valuable. The ultimate goal is that you won't need this tool anymore after plenty of hours, because you'll have learned exactly what to keep!</p>
          </section>
        </div>
      </div>
    </div>
  );
}
