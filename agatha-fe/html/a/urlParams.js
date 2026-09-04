// URL parameter handling object
const UrlParams = {
    getInitialAvatarModelPath: function() {
        const vrmParam = new URLSearchParams(window.location.search).get('vrm');
        if (vrmParam) {
            const lower = vrmParam.toLowerCase();
            if (lower === 'ava' || lower === 'avaavatar') {
                console.log('URL vrm param: ava → /models/avaAvatar.vrm');
                return '/models/avaAvatar.vrm';
            } else if (lower === 'blockman') {
                console.log('URL vrm param: blockman → /models/cube.gltf');
                return '/models/cube.gltf';
            } else if (lower.includes('constraint') || lower.includes('twist')) {
                console.log('URL vrm param: constraint/twist → /models/VRM1_Constraint_Twist_Sample.vrm');
                return '/models/VRM1_Constraint_Twist_Sample.vrm';
            } else if (vrmParam.startsWith('/') || vrmParam.startsWith('http')) {
                console.log('URL vrm param: custom path →', vrmParam);
                return vrmParam;
            } else {
                console.log('URL vrm param present but unrecognized, using default:', vrmParam);
            }
        } else {
            console.log('No vrm param in URL, using default');
        }
        return '/models/avaAvatar.vrm';
    },
    getQueryParam: function(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    },
    updateUrlParam: function(name, value) {
        const url = new URL(window.location);
        url.searchParams.set(name, value);
        window.history.pushState({}, '', url);
    }
};

export { UrlParams };
