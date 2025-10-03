import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDocs, onSnapshot, query, setLogLevel 
} from 'firebase/firestore';
import { LineChart, Zap, Gauge, Sigma, Loader, XCircle, Settings, Users, Eye } from 'lucide-react';

// --- Global Setup (MANDATORY VARIABLES) ---
// These variables are provided by the canvas environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-pmt-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Data Structure and Mapping ---

// Initial data sample based on the provided CSV snippet. 
// This array will be uploaded to Firestore once on first run.
const initialData = [
  // PMT J23-1062.txt
  { source_file: 'J23-1062.txt', current: -4.7751e-10, intensity: 176.41, wavelength: 205.988, light_response: 2.7068e-12 },
  { source_file: 'J23-1062.txt', current: -7.0588e-10, intensity: 319.546, wavelength: 216.824, light_response: 2.209e-12 },
  { source_file: 'J23-1062.txt', current: -1.1942e-09, intensity: 581.395, wavelength: 226.52, light_response: 2.0539e-12 },
  { source_file: 'J23-1062.txt', current: -2.1352e-09, intensity: 1032.77, wavelength: 237.356, light_response: 2.0674e-12 },
  { source_file: 'J23-1062.txt', current: -3.5917e-09, intensity: 1534.44, wavelength: 248.192, light_response: 2.3407e-12 },
  // PMT A24-1080.txt
  { source_file: 'A24-1080.txt', current: -1.3444e-08, intensity: 3682.72, wavelength: 280.7, light_response: 3.6506e-12 },
  { source_file: 'A24-1080.txt', current: -1.7417e-08, intensity: 4439.29, wavelength: 291.536, light_response: 3.9235e-12 },
  { source_file: 'A24-1080.txt', current: -2.1577e-08, intensity: 4655.17, wavelength: 302.372, light_response: 4.635e-12 },
  { source_file: 'A24-1080.txt', current: -2.6307e-08, intensity: 5135.2, wavelength: 313.208, light_response: 5.1229e-12 },
  { source_file: 'A24-1080.txt', current: -3.0302e-08, intensity: 5416.59, wavelength: 323.474, light_response: 5.5942e-12 },
  { source_file: 'A24-1080.txt', current: -3.3499e-08, intensity: 6589.64, wavelength: 333.739, light_response: 5.0837e-12 },
];

const Y_AXIS_OPTIONS = [
  { key: 'light_response', label: 'Light Response (A/uWatt/cm²/nm)', icon: <Zap className="w-4 h-4 mr-2" /> },
  { key: 'current', label: 'Current (A)', icon: <Sigma className="w-4 h-4 mr-2" /> },
  { key: 'intensity', label: 'Intensity (uWatt/cm²/nm)', icon: <Gauge className="w-4 h-4 mr-2" /> },
];

const PLOT_COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f97316', '#a855f7', 
  '#06b6d4', '#eab308', '#ec4899', '#84cc16', '#6366f1'
];

// --- Utility Functions ---

// Simple linear scaling function for SVG plotting
const scaleData = (value, domainMin, domainMax, rangeMin, rangeMax) => {
  return rangeMin + (rangeMax - rangeMin) * (value - domainMin) / (domainMax - domainMin);
};

// --- Custom Components ---

/**
 * Renders the main line chart using SVG.
 */
const SvgLineChart = ({ data, selectedMetric, pmtList, colorMap }) => {
  const chartWidth = 700;
  const chartHeight = 400;
  const padding = 50;

  // Use memoization to calculate scaling domains only when data or metric changes
  const { xScale, yScale, xAxisTicks, yAxisTicks, yAxisLabel } = useMemo(() => {
    if (data.length === 0) return {};

    const xValues = data.map(d => d.wavelength);
    const yValues = data.map(d => d[selectedMetric]);

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    const xTicks = [];
    for (let i = 0; i <= 5; i++) {
        xTicks.push(xMin + (xRange / 5) * i);
    }

    const yTicks = [];
    for (let i = 0; i <= 5; i++) {
        yTicks.push(yMin + (yRange / 5) * i);
    }
    
    const metricLabel = Y_AXIS_OPTIONS.find(opt => opt.key === selectedMetric)?.label || '';

    return { 
      xScale: (x) => scaleData(x, xMin, xMax, padding, chartWidth - padding),
      yScale: (y) => scaleData(y, yMin, yMax, chartHeight - padding, padding), // Note: Y is inverted for SVG
      xAxisTicks: xTicks,
      yAxisTicks: yTicks,
      yAxisLabel: metricLabel,
    };
  }, [data, selectedMetric]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-gray-50 rounded-lg p-10 border-2 border-dashed border-gray-300">
        <LineChart className="w-6 h-6 mr-2" /> No data selected or available to plot.
      </div>
    );
  }

  // Group data by PMT for plotting multiple lines
  const dataByPmt = pmtList.reduce((acc, pmt) => {
    acc[pmt] = data.filter(d => d.source_file === pmt)
                   .sort((a, b) => a.wavelength - b.wavelength); // Sort by Wavelength for clean line plot
    return acc;
  }, {});

  return (
    <div className="w-full max-w-4xl mx-auto mt-4 bg-white p-4 shadow-xl rounded-xl">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 text-center">
        {yAxisLabel} vs. Wavelength (nm)
      </h2>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="auto">
        
        {/* Y-Axis Grid Lines */}
        {yAxisTicks.map((tick, i) => (
          <g key={`y-tick-${i}`}>
            <line 
              x1={padding} 
              y1={yScale(tick)} 
              x2={chartWidth - padding} 
              y2={yScale(tick)} 
              stroke="#e5e7eb" 
              strokeDasharray="4 4" 
            />
            <text 
              x={padding - 10} 
              y={yScale(tick)} 
              dominantBaseline="middle" 
              textAnchor="end" 
              fontSize="10" 
              fill="#6b7280"
            >
              {tick.toExponential(2)}
            </text>
          </g>
        ))}

        {/* X-Axis Grid Lines */}
        {xAxisTicks.map((tick, i) => (
          <g key={`x-tick-${i}`}>
            <line 
              x1={xScale(tick)} 
              y1={padding} 
              x2={xScale(tick)} 
              y2={chartHeight - padding} 
              stroke="#e5e7eb" 
              strokeDasharray="4 4" 
            />
            <text 
              x={xScale(tick)} 
              y={chartHeight - padding + 15} 
              textAnchor="middle" 
              fontSize="10" 
              fill="#6b7280"
            >
              {tick.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Axis Labels */}
        <text x={chartWidth / 2} y={chartHeight - 5} textAnchor="middle" fontSize="12" fontWeight="bold">Wavelength (nm)</text>
        <text 
          x={10} 
          y={chartHeight / 2} 
          textAnchor="middle" 
          transform={`rotate(-90, 10, ${chartHeight / 2})`} 
          fontSize="12" 
          fontWeight="bold"
        >
          {yAxisLabel}
        </text>

        {/* Plot Lines and Markers */}
        {pmtList.map((pmt, index) => {
          const pmtData = dataByPmt[pmt];
          const color = colorMap[pmt] || PLOT_COLORS[index % PLOT_COLORS.length];

          // Create the polyline string: "x1,y1 x2,y2 ..."
          const linePath = pmtData.map(d => 
            `${xScale(d.wavelength)},${yScale(d[selectedMetric])}`
          ).join(' ');

          return (
            <g key={pmt}>
              {/* Line */}
              <polyline 
                fill="none" 
                stroke={color} 
                strokeWidth="2" 
                points={linePath} 
              />
              {/* Markers */}
              {pmtData.map((d, dIndex) => (
                <circle
                  key={dIndex}
                  cx={xScale(d.wavelength)}
                  cy={yScale(d[selectedMetric])}
                  r="4"
                  fill={color}
                  stroke="white"
                  strokeWidth="1.5"
                >
                    {/* Tooltip on hover (basic) */}
                    <title>{`${pmt}: Wavelength=${d.wavelength.toFixed(1)}nm, ${selectedMetric}=${d[selectedMetric].toExponential(3)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {/* Draw Axes after grid and lines so they are on top */}
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="black" />
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="black" />
        
      </svg>
    </div>
  );
};


/**
 * Main application component.
 */
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [allData, setAllData] = useState([]);
  const [selectedPmts, setSelectedPmts] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('light_response');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Set the Firestore collection path for public data
  const collectionPath = `artifacts/${appId}/public/data/pmt_data`;
  
  // 1. Initialize Firebase, Auth, and Database
  useEffect(() => {
    if (!firebaseConfig) {
      setError('Firebase configuration is missing. Cannot initialize application.');
      setIsLoading(false);
      return;
    }

    try {
      setLogLevel('debug'); // Enable detailed Firebase logging
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const userAuth = getAuth(app);
      
      setDb(firestore);
      setAuth(userAuth);
    } catch (e) {
      setError(`Firebase Initialization Error: ${e.message}`);
      setIsLoading(false);
    }
  }, []);


  // 2. Handle Authentication and Initial Data Setup
  useEffect(() => {
    if (!auth || !db) return;

    const authenticateAndSetup = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth Error:", e);
        setError(`Authentication failed: ${e.message}`);
        setIsAuthReady(true); // Proceed to data loading attempt
      }

      onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
          // Check if data needs to be seeded (only runs once on first user's load)
          const pmtDataRef = collection(db, collectionPath);
          const snapshot = await getDocs(pmtDataRef);
          
          if (snapshot.empty) {
            console.log("Seeding database with initial PMT data...");
            await Promise.all(initialData.map((data, index) => {
              // Use a predictable ID for each data point
              return setDoc(doc(pmtDataRef, `entry_${index}`), data);
            }));
            console.log("Database seeded successfully.");
          }
        }
        setIsAuthReady(true);
      });
    };

    authenticateAndSetup();
  }, [auth, db]);


  // 3. Listen for Real-time Data Changes (onSnapshot)
  useEffect(() => {
    if (!db || !isAuthReady) return;

    const pmtDataRef = collection(db, collectionPath);
    const q = query(pmtDataRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllData(data);
      
      // Determine all unique PMT serial numbers and initialize selection
      const uniquePmts = [...new Set(data.map(d => d.source_file))].sort();
      // Select the first 5 PMTs by default, or all if less than 5
      setSelectedPmts(prev => {
        if (prev.length === 0) {
          return uniquePmts.slice(0, Math.min(uniquePmts.length, 5));
        }
        // Ensure previously selected PMTs are still valid
        return prev.filter(p => uniquePmts.includes(p));
      });
      setIsLoading(false);
    }, (e) => {
      console.error("Firestore Snapshot Error:", e);
      setError(`Failed to fetch data: ${e.message}`);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, isAuthReady]); // Re-run only when db or auth status changes

  // --- Derived State ---

  const uniquePmts = useMemo(() => {
    return [...new Set(allData.map(d => d.source_file))].sort();
  }, [allData]);

  const pmtColorMap = useMemo(() => {
    return uniquePmts.reduce((acc, pmt, index) => {
      acc[pmt] = PLOT_COLORS[index % PLOT_COLORS.length];
      return acc;
    }, {});
  }, [uniquePmts]);

  const filteredData = useMemo(() => {
    return allData.filter(d => selectedPmts.includes(d.source_file));
  }, [allData, selectedPmts]);


  // --- Event Handlers ---

  const handlePmtToggle = (pmt) => {
    setSelectedPmts(prev => 
      prev.includes(pmt)
        ? prev.filter(p => p !== pmt)
        : [...prev, pmt]
    );
  };

  const handleSelectAll = () => {
    setSelectedPmts(uniquePmts);
  };

  const handleClearSelection = () => {
    setSelectedPmts([]);
  };

  // --- Render ---

  if (!isAuthReady || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
        <Loader className="w-8 h-8 mr-2 text-indigo-600 animate-spin" />
        <p className="text-lg font-medium text-gray-700">Loading PMT Data and Initializing...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 p-6 flex items-center justify-center">
        <div className="bg-white p-6 rounded-xl shadow-xl border-t-4 border-red-500 text-center">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-red-700">Application Error</h1>
          <p className="text-gray-600 mt-2">{error}</p>
          <p className="text-sm mt-4">User ID: {userId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-6">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-indigo-700 tracking-tight">
          PMT Data Public Explorer
        </h1>
        <p className="text-gray-600 mt-2 flex items-center justify-center">
          <Eye className="w-4 h-4 mr-1 text-indigo-500" />
          Interactive visualization for PMT performance data.
        </p>
      </header>

      {/* Control Panel and User Info */}
      <div className="bg-white shadow-2xl rounded-2xl p-6 mb-8 max-w-6xl mx-auto border border-indigo-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 mb-4">
          <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
            <Settings className="w-6 h-6 mr-2 text-indigo-500" />
            Visualization Controls
          </h2>
          <div className="mt-3 md:mt-0 text-sm text-gray-500 flex items-center">
            <Users className="w-4 h-4 mr-1" />
            Authenticated User: <span className="font-mono bg-gray-100 text-xs px-2 py-1 rounded ml-1 select-all">{userId}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PMT Selection Control */}
          <div className="lg:col-span-2 p-4 border rounded-xl bg-indigo-50/50">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Select PMT Serial Numbers ({selectedPmts.length} / {uniquePmts.length} selected)
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              <button 
                onClick={handleSelectAll} 
                className="px-3 py-1 text-sm font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-md"
              >
                Select All
              </button>
              <button 
                onClick={handleClearSelection} 
                className="px-3 py-1 text-sm font-medium rounded-full text-indigo-600 bg-indigo-100 hover:bg-indigo-200 transition shadow-md"
              >
                Clear Selection
              </button>
            </div>
            
            <div className="max-h-48 overflow-y-auto p-2 border rounded-lg bg-white">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {uniquePmts.map((pmt) => (
                  <button
                    key={pmt}
                    onClick={() => handlePmtToggle(pmt)}
                    className={`py-2 px-3 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center truncate ${
                      selectedPmts.includes(pmt)
                        ? 'bg-indigo-500 text-white shadow-lg ring-2 ring-indigo-400'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    style={{ backgroundColor: selectedPmts.includes(pmt) ? pmtColorMap[pmt] : undefined }}
                  >
                    {pmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Metric Selection Control */}
          <div className="p-4 border rounded-xl bg-gray-50">
            <label className="block text-lg font-medium text-gray-700 mb-3">
              Y-Axis Metric
            </label>
            <div className="space-y-3">
              {Y_AXIS_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setSelectedMetric(option.key)}
                  className={`w-full py-3 px-4 text-left rounded-lg transition-all duration-200 shadow-md flex items-center ${
                    selectedMetric === option.key
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Visualization Area */}
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-2xl p-6 border border-indigo-100">
        <SvgLineChart 
          data={filteredData} 
          selectedMetric={selectedMetric} 
          pmtList={selectedPmts} 
          colorMap={pmtColorMap}
        />

        {/* Legend */}
        <div className="mt-8 pt-4 border-t">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Legend (PMT Serial Number)</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {selectedPmts.map((pmt) => (
              <div key={pmt} className="flex items-center">
                <div 
                  className="w-3 h-3 rounded-full mr-2" 
                  style={{ backgroundColor: pmtColorMap[pmt] }}
                ></div>
                <span className="text-gray-600 font-medium">{pmt}</span>
              </div>
            ))}
          </div>
        </div>
        
      </div>
      
      <footer className="text-center text-sm text-gray-400 mt-8">
        Data stored publicly in Firestore collection: 
        <span className="font-mono block mt-1">{collectionPath}</span>
      </footer>
    </div>
  );
};

export default App;
