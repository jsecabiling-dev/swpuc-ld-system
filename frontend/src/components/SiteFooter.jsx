import React from 'react';

const technologies = [
  { name: 'React.js', logo: 'https://cdn.simpleicons.org/react/4B5563' },
  { name: 'Node.js', logo: 'https://cdn.simpleicons.org/nodedotjs/4B5563' },
  { name: 'MySQL', logo: 'https://cdn.simpleicons.org/mysql/4B5563', size: 34 },
  { name: 'Bootstrap', logo: 'https://cdn.simpleicons.org/bootstrap/4B5563' },
  { name: 'Google Fonts', logo: 'https://cdn.simpleicons.org/googlefonts/4B5563', size: 30},
  { name: 'GitHub', logo: 'https://cdn.simpleicons.org/github/4B5563' },
  
  //{ name: 'React Router', logo: 'https://cdn.simpleicons.org/reactrouter/4B5563' },
  //{ name: 'Express', logo: 'https://cdn.simpleicons.org/express/4B5563' },
  //{ name: 'MariaDB', logo: 'https://cdn.simpleicons.org/mariadb/4B5563' },
  //{ name: 'Vite', logo: 'https://cdn.simpleicons.org/vite/4B5563' },
  //{ name: 'PostCSS', logo: 'https://cdn.simpleicons.org/postcss/4B5563' },
];

function SiteFooter() {
  return (
    <footer className="site-footer text-center px-3 pb-3 pt-3 mt-auto">
      <small className="text-muted d-block" style={{ fontWeight: 'normal', fontStyle: 'italic' }}>
        (c)2026 Bebot Cabiling Computing &bull; Northeastern Mindanao Mission &bull; Butuan City
      </small>
      <div className="d-flex flex-wrap justify-content-center align-items-center gap-4 mt-2" aria-label="Technologies used">
        {technologies.map((technology) => (
          <span className="d-inline-flex align-items-center gap-2" title={technology.name} key={technology.name}>
            <img src={technology.logo} alt={`${technology.name} logo`}
              width={technology.size ?? 24}
              height={technology.size ?? 24}
              loading="lazy"
            />
          </span>
        ))}
      </div>
    </footer>
  );
}

export default SiteFooter;
