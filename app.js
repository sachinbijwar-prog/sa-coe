const { useState, useEffect, useMemo } = React;

// --- Components ---

const Icon = ({ name, size = 18, className = "" }) => {
    useEffect(() => {
        lucide.createIcons();
    }, [name]);

    return <i data-lucide={name.toLowerCase()} className={className} style={{ width: size, height: size }}></i>;
};

const TreeNode = ({ node, activeId, onSelect, level = 0 }) => {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = node.children && node.children.length > 0;
    const isActive = activeId === node.id;

    const handleClick = (e) => {
        e.stopPropagation();
        if (hasChildren) {
            setExpanded(!expanded);
        }
        onSelect(node.id);
    };

    return (
        <div className="tree-item">
            <div 
                className={`tree-node ${isActive ? 'active' : ''}`} 
                onClick={handleClick}
                style={{ paddingLeft: `${16 + level * 16}px` }}
            >
                <div className="tree-node-icon">
                    <Icon name={node.icon || (hasChildren ? 'folder' : 'file-text')} size={16} />
                </div>
                <span className="tree-node-label">{node.title}</span>
                {hasChildren && (
                    <Icon 
                        name="chevron-right" 
                        size={14} 
                        className={`tree-node-arrow ${expanded ? 'expanded' : ''}`} 
                    />
                )}
            </div>
            {hasChildren && expanded && (
                <div className="tree-children">
                    {node.children.map(child => (
                        <TreeNode 
                            key={child.id} 
                            node={child} 
                            activeId={activeId} 
                            onSelect={onSelect} 
                            level={level + 1} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const Sidebar = ({ taxonomy, activeId, onSelect, collapsed, toggleCollapsed }) => {
    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <Icon name="activity" size={24} className="nav-accent" />
                <span className="logo-text">CoE Portal</span>
            </div>
            <div className="sidebar-content">
                {taxonomy.map(node => (
                    <TreeNode 
                        key={node.id} 
                        node={node} 
                        activeId={activeId} 
                        onSelect={onSelect} 
                    />
                ))}
            </div>
        </aside>
    );
};

const Navbar = ({ onToggleSidebar }) => {
    return (
        <nav className="navbar">
            <div className="nav-left">
                <div className="nav-icon-btn" onClick={onToggleSidebar}>
                    <Icon name="menu" />
                </div>
            </div>
            
            <div className="search-bar">
                <Icon name="search" size={16} />
                <input type="text" placeholder="Search knowledge base..." />
            </div>

            <div className="nav-actions">
                <div className="nav-icon-btn">
                    <Icon name="bell" />
                </div>
                <div className="user-profile">
                    <div className="avatar">SA</div>
                    <Icon name="chevron-down" size={14} />
                </div>
            </div>
        </nav>
    );
};

const DocumentPanel = ({ categoryId }) => {
    const docs = window.COE_DATA.documents[categoryId] || [];

    const handleOpen = (fileName) => {
        alert(`Simulating opening: ${fileName}\n\nConnection: Microsoft OneDrive API (Mocked)`);
    };

    return (
        <div className="document-panel">
            <h3 className="section-title"><Icon name="files" /> Documents</h3>
            {docs.length > 0 ? (
                <div className="doc-list">
                    {docs.map((doc, idx) => (
                        <div key={idx} className="doc-item">
                            <div className="doc-info">
                                <div className="doc-type-icon">
                                    <Icon name={doc.type === 'PDF' ? 'file-text' : (doc.type === 'Excel' ? 'table' : 'file')} />
                                </div>
                                <div>
                                    <span className="doc-name">{doc.name}</span>
                                    <span className="doc-meta">{doc.type} • {doc.size} • Last updated {doc.updated}</span>
                                </div>
                            </div>
                            <button className="btn btn-outline" onClick={() => handleOpen(doc.name)}>Open</button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="no-docs">No documents available for this section yet.</p>
            )}
        </div>
    );
};

const Dashboard = ({ onNavigate }) => {
    const accelerators = window.COE_DATA.featuredAccelerators;

    return (
        <div className="dashboard-view">
            <header className="hero">
                <h1>Centre of Excellence Portal</h1>
                <p>Enterprise Intelligence & Data Engineering Hub</p>
            </header>

            <div className="stats-grid">
                {accelerators.map(item => (
                    <div key={item.id} className="card tile" onClick={() => onNavigate(item.id)}>
                        <div className="tile-icon">
                            <Icon name={item.icon} size={24} />
                        </div>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <section>
                    <h3 className="section-title"><Icon name="link" /> Quick Links</h3>
                    <div className="card">
                        <ul style={{ listStyle: 'none' }}>
                            <li style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--accent)' }}>
                                <Icon name="external-link" size={14} style={{ marginRight: '8px' }} />
                                Azure Portal - Data Engineering
                            </li>
                            <li style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--accent)' }}>
                                <Icon name="external-link" size={14} style={{ marginRight: '8px' }} />
                                Cloudera Manager Dashboard
                            </li>
                            <li style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--accent)' }}>
                                <Icon name="external-link" size={14} style={{ marginRight: '8px' }} />
                                Power BI Report Samples
                            </li>
                        </ul>
                    </div>
                </section>

                <section>
                    <h3 className="section-title"><Icon name="clock" /> Recent Articles</h3>
                    <div className="card">
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MAR 24, 2024</span>
                            <p style={{ fontWeight: '600' }}>Hive to Impala Migration Strategy</p>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MAR 20, 2024</span>
                            <p style={{ fontWeight: '600' }}>Spark Optimization for Large Datasets</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

const ContentPage = ({ nodeId, taxonomy }) => {
    // Find node path for breadcrumbs
    const findNodePath = (nodes, id, path = []) => {
        for (const node of nodes) {
            if (node.id === id) return [...path, node.title];
            if (node.children) {
                const childPath = findNodePath(node.children, id, [...path, node.title]);
                if (childPath) return childPath;
            }
        }
        return null;
    };

    const path = useMemo(() => findNodePath(taxonomy, nodeId), [nodeId, taxonomy]);

    return (
        <div className="content-page">
            <div className="breadcrumb">
                <span>Core</span>
                <Icon name="chevron-right" size={12} />
                {path && path.map((name, idx) => (
                    <React.Fragment key={idx}>
                        <span className={idx === path.length - 1 ? 'current' : ''}>{name}</span>
                        {idx < path.length - 1 && <Icon name="chevron-right" size={12} />}
                    </React.Fragment>
                ))}
            </div>

            <header className="page-header">
                <h2>{path ? path[path.length - 1] : 'Section Details'}</h2>
                <p>This section contains detailed specifications, best practices, and resources related to {path ? path[path.length - 1] : 'this topic'}.</p>
            </header>

            <DocumentPanel categoryId={nodeId} />

            <div className="related-links">
                <h3 className="section-title"><Icon name="link" /> Related Resources</h3>
                <div className="card">
                    <p style={{color: 'var(--accent)', cursor: 'pointer'}}>Internal KT Session Recording - Mar 2024</p>
                    <hr style={{margin: '12px 0', opacity: 0.1}} />
                    <p style={{color: 'var(--accent)', cursor: 'pointer'}}>External Microsoft Tech Docs: Azure Data Factory</p>
                </div>
            </div>
        </div>
    );
};

const App = () => {
    const [activeId, setActiveId] = useState('home');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [taxonomy, setTaxonomy] = useState([]);

    useEffect(() => {
        // Wait for data to be loaded from global window object
        const checkData = setInterval(() => {
            if (window.COE_DATA) {
                setTaxonomy(window.COE_DATA.taxonomy);
                clearInterval(checkData);
            }
        }, 100);
        return () => clearInterval(checkData);
    }, []);

    const handleNavigate = (id) => {
        setActiveId(id);
    };

    return (
        <div className="app-container">
            <Sidebar 
                taxonomy={taxonomy} 
                activeId={activeId} 
                onSelect={handleNavigate}
                collapsed={sidebarCollapsed}
                toggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            
            <main className="main-wrapper">
                <Navbar onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
                
                <div className="content-area">
                    {activeId === 'home' ? (
                        <Dashboard onNavigate={handleNavigate} />
                    ) : (
                        <ContentPage nodeId={activeId} taxonomy={taxonomy} />
                    )}
                </div>
            </main>
        </div>
    );
};

// --- Render ---

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
