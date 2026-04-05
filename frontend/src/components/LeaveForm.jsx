const submitLeave = async (event) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append("leave_type", type);
    formData.append("start_date", startDate);
    formData.append("end_date", endDate);
    if (file) formData.append("medical_report", file);

    const response = await fetch("/api/leave/request", {
        method: "POST",
        body: formData, // Browser automatically sets Content-Type to multipart/form-data
        headers: { "Authorization": `Bearer ${token}` }
    });
};