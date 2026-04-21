package cctv

// VIID Protocol DTOs for TungSon camera integration

// VIIDKeepaliveRequest is the body of POST /VIID/System/Keepalive
type VIIDKeepaliveRequest struct {
	KeepaliveObject struct {
		DeviceID string `json:"DeviceID"`
	} `json:"KeepaliveObject"`
}

// VIIDRegisterRequest is the body of POST /VIID/System/Register
type VIIDRegisterRequest struct {
	RegisterObject struct {
		DeviceID string `json:"DeviceID"`
	} `json:"RegisterObject"`
}

// VIIDResponseStatus is the standard VIID response envelope
type VIIDResponseStatus struct {
	ResponseStatusObject struct {
		RequestURL   string `json:"RequestURL"`
		StatusCode   string `json:"StatusCode"`
		StatusString string `json:"StatusString"`
		ID           string `json:"ID"`
		ExtendCmd    int    `json:"ExtendCmd,omitempty"`
	} `json:"ResponseStatusObject"`
}

// VIIDPersonList is the response for GET /VIID/Extend/ExtendFaceList
type VIIDPersonList struct {
	PersonListObject struct {
		Person []VIIDPerson `json:"Person"`
	} `json:"PersonListObject"`
}

// VIIDPerson represents a person entry in the face list
type VIIDPerson struct {
	TaskID       string            `json:"TaskID"`
	PersonID     string            `json:"PersonID"`
	Name         string            `json:"Name"`
	GroupID      string            `json:"GroupID"`
	Type         int               `json:"Type"` // 0=add, 2=delete
	SubImageList *VIIDSubImageList `json:"SubImageList,omitempty"`
}

// VIIDSubImageList contains face images
type VIIDSubImageList struct {
	SubImageInfoObject []VIIDSubImage `json:"SubImageInfoObject"`
}

// VIIDSubImage is a single face image
type VIIDSubImage struct {
	Data        string  `json:"Data"`
	FileFormat  string  `json:"FileFormat"`
	ImageID     string  `json:"ImageID"`
	ShotTime    string  `json:"ShotTime"`
	StoragePath *string `json:"StoragePath"`
	Type        string  `json:"Type"`
}

// VIIDFaceRecognitionRequest is the body of POST /VIID/Extend/ExtendFaceRecognition
type VIIDFaceRecognitionRequest struct {
	PersonRecognitionResultListObject struct {
		PersonRecognitionObject []VIIDRecognitionResult `json:"PersonRecognitionObject"`
	} `json:"PersonRecognitionResultListObject"`
}

// VIIDRecognitionResult is a single face recognition result
type VIIDRecognitionResult struct {
	DeviceID        string            `json:"DeviceID"`
	PersonID        string            `json:"PersonID"`
	Similarity      string            `json:"Similarity"` // camera sends as string "0.828"
	RecognitionTime string            `json:"RecognitionTime"`
	SubImageList    *VIIDSubImageList `json:"SubImageList,omitempty"`
}

// VIIDUnknownFaceRequest is the body of POST /VIID/Faces
type VIIDUnknownFaceRequest struct {
	FaceListObject struct {
		FaceObject []VIIDFaceObject `json:"FaceObject"`
	} `json:"FaceListObject"`
}

// VIIDFaceObject is an unknown face detection
type VIIDFaceObject struct {
	DeviceID     string            `json:"DeviceID"`
	ShotTime     string            `json:"ShotTime"`
	SubImageList *VIIDSubImageList `json:"SubImageList,omitempty"`
}

// VIIDConfirmRequest is the body of POST /VIID/Extend/ExtendConfirm
type VIIDConfirmRequest struct {
	ConfirmListObject struct {
		ConfirmObject []VIIDConfirmObject `json:"ConfirmObject"`
	} `json:"ConfirmListObject"`
}

// VIIDConfirmObject is a single confirmation of face add/delete
type VIIDConfirmObject struct {
	DeviceID   string `json:"DeviceID"`
	TaskID     string `json:"TaskID"`
	StatusCode int    `json:"StatusCode"` // 0=success, other=failure
}

// TungSon command constants
const (
	CmdAddFace   = 10001
	CmdDeleteAll = 10002
)
