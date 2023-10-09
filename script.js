let salar = [];
function handleFileSelect(event) {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const contents = e.target.result;
    const lines = contents.split("\n");

    lines.forEach(function (line) {
      // Skip empty lines
      if (line.trim() === "") {
        return;
      }

      const cells = line.split(",");
      const street = cells[0];
      const city = cells[2];
      const number = cells[1];
      const long = cells[3];
      const lat = cells[4];

      const c = {
        st: street,
        cit: city,
        num: number,
        long: long,
        lat: lat,
      };

      salar.push(c);
    });

    // Generate the table HTML
    let tableHtml = '<table border="1">';
    tableHtml +=
      "<tr><th>Street</th><th>Number</th><th>City</th><th>Longitude</th><th>Latitude</th></tr>";

    salar.forEach(function (entry) {
      tableHtml += "<tr>";
      tableHtml += "<td>" + entry.st + "</td>";
      tableHtml += "<td>" + entry.num + "</td>";
      tableHtml += "<td>" + entry.cit + "</td>";
      tableHtml += "<td>" + entry.long + "</td>";
      tableHtml += "<td>" + entry.lat + "</td>";
      tableHtml += "</tr>";
    });

    tableHtml += "</table>";
    document.getElementById("tableContainer").innerHTML = tableHtml;
  };

  reader.readAsText(file);
}

function displayTable() {
  const input = document.getElementById("csvFileInput");
  if (input.files.length > 0) {
    handleFileSelect({ target: { files: [input.files[0]] } });
    console.log(salar); // Output the parsed data to the console
  } else {
    alert("Please select a CSV file first.");
  }
}

function appendResultTable(testResults) {
  let tableHtml = '<table border="1">';
  tableHtml +=
    "<tr><th>Street</th><th>Number</th><th>City</th><th>Longitude</th><th>Latitude</th></tr>";

  testResults.apiResponses.forEach((result) => {
    tableHtml += "<tr>";
    tableHtml += "<td>" + (result.street || result) + "</td>";
    tableHtml += "<td>" + (result.number || "NA") + "</td>";
    tableHtml += "<td>" + (result.city || "NA") + "</td>";
    tableHtml += "<td>" + (result.longitude || "NA") + "</td>";
    tableHtml += "<td>" + (result.latitude || "NA") + "</td>";
    tableHtml += "</tr>";
  });

  const totalTime = (testResults.endTime - testResults.startTime) / 1000;
  const successfulRate =
    (testResults.successfulRequests / testResults.totalRequests) * 100;
  const requestRate = testResults.totalRequests / totalTime;

  let metricsTableHtml = '<table border="1">';
  metricsTableHtml += `<tr><th>Total Requests</th><td>${testResults.totalRequests}</td></tr>`;
  metricsTableHtml += `<tr><th>Successful Requests</th><td>${testResults.successfulRequests}</td></tr>`;
  metricsTableHtml += `<tr><th>Failed Requests</th><td>${testResults.failedRequests}</td></tr>`;
  metricsTableHtml += `<tr><th>Successful Request Rate</th><td>${successfulRate.toFixed(
    2
  )}%</td></tr>`;
  metricsTableHtml += `<tr><th>Total Time</th><td>${totalTime} seconds</td></tr>`;
  metricsTableHtml += `<tr><th>Request Rate</th><td>${requestRate.toFixed(
    2
  )} requests per second</td></tr>`;
  metricsTableHtml += "</table>";

  document.getElementById("metricsTableContainer").innerHTML = metricsTableHtml;
  document.getElementById("apiResponseTableContainer").innerHTML = tableHtml;
}

async function resolveBatch(requestBatchNumber, requestBatch, callBack) {
  const promises = [];
  try {
    for (const [index, request] of requestBatch[requestBatchNumber].entries()) {
      const query = `http://localhost:300/geocode?street=${encodeURIComponent(
        request.st
      )}&number=${encodeURIComponent(request.num)}&city=${encodeURIComponent(
        request.cit
      )}`;

      try {
        const response = await fetchWithTimeout(
          query,
          { method: "GET", headers: { "Content-Type": "application/json" } },
          5000
        );

        return {
          success: true,
          response: await response.json(),
          originalIndex: requestBatchNumber * requestBatch.length + index,
        };
      } catch (error) {
        return {
          success: false,
          response: error,
          originalIndex: requestBatchNumber * requestBatch.length + index,
        };
      }
    }
    const responses = await Promise.all(promises);
    callBack(responses);
  } catch (error) {
    throw error; // Let the error propagate to the caller for proper handling
  }
}

async function callLocalAPIButton(config) {
  const requestBatches = Array.from(
    { length: Math.ceil(salar.length / config.batchSize) },
    (v, index) =>
      salar.slice(
        index * config.batchSize,
        index * config.batchSize + config.batchSize
      )
  );

  const testResults = {
    totalRequests: salar.length,
    startTime: Date.now(),
    apiResponses: {},
    successfulRequests: 0,
    failedRequests: 0,
    endTime: NaN,
  };

  let requestBathNumber = 0;

  const batchFunction = (intervalId) => {
    if (requestBathNumber >= requestBatches.length) {
      console.log("Finish");
      clearInterval(intervalId);
      return;
    }
    console.log("Send batch.");
    resolveBatch(requestBathNumber, requestBatches, async (responses) => {
      for (const result of responses) {
        const originalIndex = result.originalIndex;
        if (result.success) {
          try {
            result.response = await result.response.json();
          } catch (error) {
            console.error("Error parsing JSON:", error);
          }
        }

        testResults.apiResponses[originalIndex] = result.response;
        if (result.success) testResults.successfulRequests += 1;
        else testResults.failedRequests += 1;
      }
      if (requestBathNumber == requestBatches.length) {
        testResults.endTime = Date.now();
        testResults.apiResponses = Object.keys(testResults.apiResponses)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map((index) => testResults.apiResponses[index]);
        appendResultTable(testResults);
      }
    });
    requestBathNumber += 1;
  };

  const intervalId = setInterval(() => batchFunction(intervalId), 1000);
}

async function callLocalAPIButtonOld() {
  const batchSize = 50; 
  const totalRequests = salar.length;
  let startTime = Date.now();
  let successfulRequests = 0;
  let failedRequests = 0;
  let apiResponses = new Array(totalRequests).fill(null); 

  try {
    for (let i = 0; i < totalRequests; i += batchSize) {
      const batch = salar.slice(i, i + batchSize);
      const apiRequests = batch.map(async (entry, index) => {
        const apiUrl = `http://localhost:300/geocode?street=${encodeURIComponent(
          entry.st
        )}&number=${encodeURIComponent(entry.num)}&city=${encodeURIComponent(
          entry.cit
        )}`;
        try {
          const response = await fetchWithTimeout(
            apiUrl,
            { method: "GET", headers: { "Content-Type": "application/json" }},
            10000
          );
          if (response.ok) {
            const data = await response.json();
            apiResponses[i + index] = data; 
            successfulRequests += 1;
          } else if (response.status !== 200) {
            apiResponses[i + index] = { error: "Not Found" };
            failedRequests += 1;
          } else {
            apiResponses[i + index] = {
              error: `Error: ${response.statusText}`,
            };
            failedRequests += 1;
          }
        } catch (error) {
          console.error("Error:", error);
          apiResponses[i + index] = { error: error.message }; // Store error response
          failedRequests += 1;
        }
      });
      await Promise.all(apiRequests);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay for 1 second before sending the next batch
    }
    let tableHtml = '<table border="1">';
    tableHtml +=
      "<tr><th>Street</th><th>Number</th><th>City</th><th>Longitude</th><th>Latitude</th></tr>";
    apiResponses.forEach((result) => {
      tableHtml += "<tr>";
      tableHtml += "<td>" + (result.street || result) + "</td>";
      tableHtml += "<td>" + (result.number || "NA") + "</td>";
      tableHtml += "<td>" + (result.city || "NA") + "</td>";
      tableHtml += "<td>" + (result.longitude || "NA") + "</td>";
      tableHtml += "<td>" + (result.latitude || "NA") + "</td>";
      tableHtml += "</tr>";
    });

    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    const successfulRate = (successfulRequests / totalRequests) * 100;
    const requestRate = totalRequests / totalTime;

    let metricsTableHtml = '<table border="1">';
    metricsTableHtml += `<tr><th>Total Requests</th><td>${totalRequests}</td></tr>`;
    metricsTableHtml += `<tr><th>Successful Requests</th><td>${successfulRequests}</td></tr>`;
    metricsTableHtml += `<tr><th>Failed Requests</th><td>${failedRequests}</td></tr>`;
    metricsTableHtml += `<tr><th>Successful Request Rate</th><td>${successfulRate.toFixed(
      2
    )}%</td></tr>`;
    metricsTableHtml += `<tr><th>Total Time</th><td>${totalTime} seconds</td></tr>`;
    metricsTableHtml += `<tr><th>Request Rate</th><td>${requestRate.toFixed(
      2
    )} requests per second</td></tr>`;
    metricsTableHtml += "</table>";

    document.getElementById("metricsTableContainer").innerHTML =
      metricsTableHtml;
    document.getElementById("apiResponseTableContainer").innerHTML = tableHtml;
  } catch (error) {
    console.error("Error:", error);
  }
}

async function fetchWithTimeout(apiUrl, options, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(); // Abort the request if it takes longer than the specified timeout
  }, timeout);

  try {
    const response = await fetch(apiUrl, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId); // Clear the timeout if the request completes before the timeout duration

    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out");
    } else {
      throw error; // Re-throw other errors
    }
  }
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c * 1000; // Distance in meters
  return distance;
}

function calculateAndDisplayDistancesWithStatus() {
  const table1 = document.getElementById("tableContainer");
  const table2 = document.getElementById("apiResponseTableContainer");

  const rows1 = table1.getElementsByTagName("tr");
  const rows2 = table2.getElementsByTagName("tr");

  if (rows1.length > 1 && rows2.length > 1) {
    let combinedTableHtml = '<table border="1">';
    combinedTableHtml += "<tr><th>Distance (meters)</th><th>Status</th></tr>";

    for (let i = 1; i < rows1.length; i++) {
      const row1 = rows1[i].getElementsByTagName("td");
      const row2 = rows2[i].getElementsByTagName("td");

      const latitude1 = parseFloat(row1[4].innerText); // Assuming latitude is in the fifth column
      const longitude1 = parseFloat(row1[3].innerText); // Assuming longitude is in the fourth column
      const latitude2 = parseFloat(row2[4].innerText); // Assuming latitude is in the fifth column
      const longitude2 = parseFloat(row2[3].innerText); // Assuming longitude is in the fourth column

      const distance = calculateHaversineDistance(
        latitude1,
        longitude1,
        latitude2,
        longitude2
      );

      // Determine status based on distance
      const isLessThan100m = distance < 100;
      const statusClass = isLessThan100m ? "green-dot" : "red-dot";

      // Add a new row to the combined table with distance and status
      combinedTableHtml += "<tr>";
      combinedTableHtml += `<td>${distance.toFixed(2)}</td>`;
      combinedTableHtml += `<td><div class="dot ${statusClass}"></div></td>`;
      combinedTableHtml += "</tr>";
    }

    combinedTableHtml += "</table>";

    // Display the combined table in the designated container
    const combinedTableContainer = document.getElementById(
      "combinedTableContainer"
    );
    combinedTableContainer.innerHTML = combinedTableHtml;
  } else {
    alert("show the table first");
  }
}

function exportToCSV() {
  const table1 = document.getElementById("tableContainer");
  const table2 = document.getElementById("apiResponseTableContainer");
  const combinedTable = document.getElementById("combinedTableContainer");

  const rows1 = table1.getElementsByTagName("tr");
  const rows2 = table2.getElementsByTagName("tr");
  const combinedRows = combinedTable.getElementsByTagName("tr");

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent +=
    "Street,Number,City,Longitude,Latitude,APIstreet,APInumber,APIcity,APIlongitude,APIlatitude,distance,status\n";

  for (let i = 1; i < rows1.length; i++) {
    const row1 = rows1[i].getElementsByTagName("td");
    const row2 = rows2[i].getElementsByTagName("td");
    const combinedRow = combinedRows[i].getElementsByTagName("td");

    const rowData = [];
    for (let j = 0; j < row1.length; j++) {
      rowData.push(row1[j].innerText);
    }
    for (let j = 0; j < row2.length; j++) {
      rowData.push(row2[j].innerText);
    }
    for (let j = 0; j < combinedRow.length; j++) {
      rowData.push(combinedRow[j].innerText);
    }

    csvContent += rowData.join(",") + "\n";
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "exported_data.csv");
  document.body.appendChild(link);
  link.click();
}

function getTableCSVContent(rows) {
  let csvContent = "";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].getElementsByTagName("td");
    const rowData = [];
    for (let j = 0; j < row.length; j++) {
      rowData.push(row[j].innerText);
    }
    csvContent += rowData.join(",") + "\n";
  }
  return csvContent;
}

function exportMetricsToCSV() {
  const metricsTable = document.getElementById("metricsTableContainer");
  const rows = metricsTable.getElementsByTagName("tr");

  let csvContent = "data:text/csv;charset=utf-8,";
  for (let i = 0; i < rows.length; i++) {
    const columns = rows[i].getElementsByTagName("td");
    const rowData = [];
    for (let j = 0; j < columns.length; j++) {
      rowData.push(columns[j].innerText);
    }
    csvContent += rowData.join(",") + "\n";
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "metrics_data.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
