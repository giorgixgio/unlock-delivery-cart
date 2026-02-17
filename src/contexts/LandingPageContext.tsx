import React, { createContext, useContext } from "react";

interface LandingPageContextType {
  isLandingPage: boolean;
  landingSlug: string;
}

const LandingPageContext = createContext<LandingPageContextType>({
  isLandingPage: false,
  landingSlug: "",
});

export const LandingPageProvider: React.FC<{
  children: React.ReactNode;
  slug: string;
}> = ({ children, slug }) => (
  <LandingPageContext.Provider value={{ isLandingPage: true, landingSlug: slug }}>
    {children}
  </LandingPageContext.Provider>
);

export const useLandingPage = () => useContext(LandingPageContext);
