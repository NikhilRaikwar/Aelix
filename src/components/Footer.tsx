
import React from 'react';
import { Instagram, Twitter, Linkedin, Github } from 'lucide-react';
import Logo from './Logo';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-8 px-4 bg-background border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <Logo className="h-16" />
          </div>
          <p className="text-muted-foreground">
            Redefining experiences with precision and elegance.
          </p>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground mb-4 md:mb-0">
            © {currentYear} Aelix. All rights reserved.
          </p>
          
          <div className="flex items-center gap-4">
            {[
              { icon: <Twitter size={20} />, href: 'https://x.com/aelix_ai' },
              { icon: <Github size={20} />, href: 'https://github.com/NikhilRaikwar/Aelix' }
            ].map((item, i) => (
              <a 
                key={i}
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Social media link ${i + 1}`}
              >
                {item.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
