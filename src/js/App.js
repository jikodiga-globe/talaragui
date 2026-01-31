import React from "react";
import {
  Routes,
  Route
} from "react-router-dom";

import Home from "./Home";

export default App = () => {

  return (
    <React.Fragment>
      <Routes>
        <Route
          path="/"
          element={<Home/>}
        />
      </Routes>
    </React.Fragment>
  );
}
