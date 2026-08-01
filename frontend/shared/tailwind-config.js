tailwind.config = {
  darkMode: "class",
  theme: { extend: {
    "colors": {
      "on-secondary":"#ffffff","surface-container-high":"#eae7e7","background":"#fcf9f8",
      "on-error-container":"#93000a","on-surface-variant":"#3e4a3f","on-secondary-container":"#1b218f",
      "tertiary":"#5d5f5f","on-surface":"#1c1b1b","outline-variant":"#bdcabc","surface-container":"#f0eded",
      "surface-container-lowest":"#ffffff","on-primary-container":"#005025","secondary":"#4b53bc",
      "primary-fixed-dim":"#66dd8b","surface-container-highest":"#e5e2e1","primary":"#006d36",
      "surface":"#fcf9f8","error-container":"#ffdad6","surface-container-low":"#f6f3f2",
      "on-error":"#ffffff","on-primary":"#ffffff","secondary-container":"#8991fe","on-background":"#1c1b1b",
      "error":"#ba1a1a","outline":"#6e7a6e","surface-variant":"#e5e2e1","primary-container":"#50c878",
      "primary-fixed":"#83fba5","inverse-primary":"#66dd8b","surface-dim":"#dcd9d9",
      "on-tertiary-fixed-variant":"#454747","tertiary-container":"#b1b2b2",
      "on-tertiary-container":"#434545","on-primary-fixed-variant":"#005227","tertiary-fixed-dim":"#c6c6c7",
      "inverse-on-surface":"#f3f0ef","surface-bright":"#fcf9f8","secondary-fixed-dim":"#bfc2ff",
      "tertiary-fixed":"#e2e2e2","on-tertiary-fixed":"#1a1c1c","inverse-surface":"#313030",
      "secondary-fixed":"#e0e0ff","surface-tint":"#006d36","on-secondary-fixed":"#00006e",
      "on-primary-fixed":"#00210c","on-secondary-fixed-variant":"#3239a3","on-tertiary":"#ffffff"
    },
    "borderRadius":{"DEFAULT":"0.125rem","lg":"0.25rem","xl":"0.5rem","full":"0.75rem"},
    "spacing":{"unit":"8px","gutter":"24px","stack-sm":"8px","stack-xl":"48px","margin":"32px","stack-lg":"24px","stack-xs":"4px","stack-md":"16px","container-max":"1440px"},
    "fontFamily":{"headline-lg":["Inter"],"label-bold":["Inter"],"body-md":["Inter"],"headline-md":["Inter"],"data-mono":["Inter"],"body-lg":["Inter"],"headline-xl":["Inter"],"body-sm":["Inter"]},
    "fontSize":{
      "headline-lg":["32px",{"lineHeight":"40px","letterSpacing":"-0.01em","fontWeight":"600"}],
      "label-bold":["12px",{"lineHeight":"16px","letterSpacing":"0.05em","fontWeight":"700"}],
      "body-md":["16px",{"lineHeight":"24px","fontWeight":"400"}],
      "headline-md":["24px",{"lineHeight":"32px","fontWeight":"600"}],
      "data-mono":["14px",{"lineHeight":"20px","letterSpacing":"-0.01em","fontWeight":"500"}],
      "body-lg":["18px",{"lineHeight":"28px","fontWeight":"400"}],
      "headline-xl":["40px",{"lineHeight":"48px","letterSpacing":"-0.02em","fontWeight":"700"}],
      "body-sm":["14px",{"lineHeight":"20px","fontWeight":"400"}]
    }
  }}
}
